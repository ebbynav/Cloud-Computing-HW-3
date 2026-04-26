"use strict";

const AWS = require("aws-sdk");
const {
  decodeS3Key,
  normalizeLabel,
  parseJsonBody,
  getResolvedCredentials,
  requestJson,
  signOpenSearchRequest,
  splitLabels,
  toIsoTimestamp,
  uniqueLabels
} = require("./shared");

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

const INDEX_NAME = process.env.OPENSEARCH_INDEX || "photos";
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || process.env.ELASTICSEARCH_ENDPOINT || "";
const OPENSEARCH_BASE_PATH = process.env.OPENSEARCH_BASE_PATH || "";
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

exports.handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  const results = [];

  for (const record of records) {
    results.push(await indexRecord(record));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      processed: results.length,
      results
    })
  };
};

async function indexRecord(record) {
  const bucket = record?.s3?.bucket?.name;
  const objectKey = decodeS3Key(record?.s3?.object?.key);

  if (!bucket || !objectKey) {
    throw new Error("Invalid S3 event payload");
  }

  const headResponse = await s3.headObject({
    Bucket: bucket,
    Key: objectKey
  }).promise();

  const rekognitionResponse = await rekognition.detectLabels({
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: objectKey
      }
    },
    MaxLabels: 20,
    MinConfidence: 70
  }).promise();

  const customLabels = splitLabels(headResponse.Metadata?.customlabels || headResponse.Metadata?.customLabels || "");
  const rekognitionLabels = (rekognitionResponse.Labels || []).map((label) => normalizeLabel(label.Name));
  const labels = uniqueLabels([...customLabels, ...rekognitionLabels]);

  const document = {
    objectKey,
    bucket,
    createdTimestamp: toIsoTimestamp(headResponse.LastModified || record?.eventTime),
    labels
  };

  if (OPENSEARCH_ENDPOINT) {
    await saveDocument(document);
  } else {
    console.log("OpenSearch endpoint not configured; skipping index write", document);
  }

  return document;
}

async function saveDocument(document) {
  const url = new URL(OPENSEARCH_ENDPOINT);
  const endpoint = new AWS.Endpoint(url.origin);
  const path = [
    url.pathname.replace(/\/$/, ""),
    OPENSEARCH_BASE_PATH.replace(/^\/+|\/+$/g, ""),
    INDEX_NAME,
    "_doc",
    encodeURIComponent(document.objectKey)
  ]
    .filter(Boolean)
    .join("/")
    .replace(/\/\/+/g, "/");

  const request = new AWS.HttpRequest(endpoint, REGION);
  request.method = "PUT";
  request.path = path.startsWith("/") ? path : `/${path}`;
  request.headers.host = endpoint.host;
  request.headers["content-type"] = "application/json";
  request.body = JSON.stringify(document);

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
}
