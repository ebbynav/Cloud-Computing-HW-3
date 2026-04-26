"use strict";

const AWS = require("aws-sdk");
const {
  normalizeLabel,
  getResolvedCredentials,
  parseJsonBody,
  requestJson,
  signOpenSearchRequest,
  uniqueLabels
} = require("./shared");

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const INDEX_NAME = process.env.OPENSEARCH_INDEX || "photos";
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || process.env.ELASTICSEARCH_ENDPOINT || "";
const OPENSEARCH_BASE_PATH = process.env.OPENSEARCH_BASE_PATH || "";
const LEX_BOT_ID = process.env.LEX_BOT_ID || "";
const LEX_BOT_ALIAS_ID = process.env.LEX_BOT_ALIAS_ID || "";
const LEX_LOCALE_ID = process.env.LEX_LOCALE_ID || "en_US";

const lexRuntimeV2 = new AWS.LexRuntimeV2({ region: REGION });

exports.handler = async (event) => {
  const query = String(event?.queryStringParameters?.q || "").trim();

  if (!query) {
    return jsonResponse(200, {
      query,
      results: []
    });
  }

  const keywords = uniqueLabels(await disambiguateQuery(query));
  if (!keywords.length || !OPENSEARCH_ENDPOINT) {
    return jsonResponse(200, {
      query,
      keywords,
      results: []
    });
  }

  const results = await searchDocuments(keywords);
  return jsonResponse(200, {
    query,
    keywords,
    results
  });
};

async function disambiguateQuery(query) {
  if (!LEX_BOT_ID || !LEX_BOT_ALIAS_ID) {
    return extractKeywords(query);
  }

  try {
    const response = await lexRuntimeV2.recognizeText({
      botId: LEX_BOT_ID,
      botAliasId: LEX_BOT_ALIAS_ID,
      localeId: LEX_LOCALE_ID,
      sessionId: `search-${Date.now()}`,
      text: query
    }).promise();

    const interpretation = response.interpretations?.[0];
    const slots = interpretation?.intent?.slots || {};
    const slotKeywords = Object.values(slots)
      .flatMap((slot) => extractSlotValue(slot))
      .filter(Boolean);

    if (slotKeywords.length) {
      return slotKeywords;
    }

    const generated = extractKeywords(interpretation?.inputTranscript || query);
    return generated.length ? generated : extractKeywords(query);
  } catch (error) {
    console.warn("Lex disambiguation failed; falling back to keyword extraction", error);
    return extractKeywords(query);
  }
}

function extractSlotValue(slot) {
  const values = [];

  if (!slot) {
    return values;
  }

  if (typeof slot.value?.interpretedValue === "string") {
    values.push(slot.value.interpretedValue);
  }

  if (Array.isArray(slot.values)) {
    for (const item of slot.values) {
      if (typeof item?.value?.interpretedValue === "string") {
        values.push(item.value.interpretedValue);
      }
    }
  }

  return values.map((value) => normalizeLabel(value)).filter(Boolean);
}

function extractKeywords(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => normalizeLabel(token))
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token));
}

async function searchDocuments(keywords) {
  const url = new URL(OPENSEARCH_ENDPOINT);
  const endpoint = new AWS.Endpoint(url.origin);
  const path = [
    url.pathname.replace(/\/$/, ""),
    OPENSEARCH_BASE_PATH.replace(/^\/+|\/+$/g, ""),
    INDEX_NAME,
    "_search"
  ]
    .filter(Boolean)
    .join("/")
    .replace(/\/\/+/g, "/");

  const queryBody = {
    size: 25,
    query: {
      bool: {
        should: keywords.map((keyword) => ({
          multi_match: {
            query: keyword,
            fields: ["labels", "objectKey"]
          }
        })),
        minimum_should_match: 1
      }
    }
  };

  const request = new AWS.HttpRequest(endpoint, REGION);
  request.method = "POST";
  request.path = path.startsWith("/") ? path : `/${path}`;
  request.headers.host = endpoint.host;
  request.headers["content-type"] = "application/json";
  request.body = JSON.stringify(queryBody);

  const credentials = await getResolvedCredentials(AWS);
  signOpenSearchRequest({
    request,
    region: REGION,
    credentials,
    AWS
  });

  const response = await requestJson({
    hostname: endpoint.hostname,
    method: request.method,
    path: request.path,
    headers: request.headers,
    body: request.body
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const payload = parseJsonBody(response.body);
    throw new Error(payload?.error?.reason || payload?.message || `OpenSearch HTTP ${response.statusCode}`);
  }

  const payload = parseJsonBody(response.body);
  const hits = Array.isArray(payload?.hits?.hits) ? payload.hits.hits : [];

  return hits.map((hit) => ({
    objectKey: hit?._source?.objectKey || hit?._id || "",
    bucket: hit?._source?.bucket || "",
    createdTimestamp: hit?._source?.createdTimestamp || "",
    labels: Array.isArray(hit?._source?.labels) ? hit._source.labels : [],
    imageUrl: hit?._source?.imageUrl || ""
  }));
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

const STOP_WORDS = new Set([
  "show",
  "me",
  "photo",
  "photos",
  "image",
  "images",
  "with",
  "the",
  "and",
  "a",
  "an",
  "at",
  "in",
  "of",
  "my",
  "please",
  "find",
  "for",
  "them",
  "to",
  "on"
]);
