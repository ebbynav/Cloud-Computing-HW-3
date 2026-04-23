"use strict";

const https = require("https");

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLabels(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((label) => normalizeLabel(label))
    .filter(Boolean);
}

function uniqueLabels(labels) {
  return [...new Set(labels.map((label) => normalizeLabel(label)).filter(Boolean))];
}

function toIsoTimestamp(value) {
  if (!value) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "");
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "");
  }

  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

function decodeS3Key(key) {
  return decodeURIComponent(String(key || "").replace(/\+/g, " "));
}

function buildS3ObjectUrl(bucket, key, baseUrl) {
  if (baseUrl) {
    const trimmedBase = String(baseUrl).replace(/\/$/, "");
    return `${trimmedBase}/${String(key).replace(/^\/+/, "")}`;
  }

  return `s3://${bucket}/${key}`;
}

function requestJson({ hostname, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        method,
        path,
        headers
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: data
          });
        });
      }
    );

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function signOpenSearchRequest({ request, region, service = "es", credentials, AWS }) {
  const signer = new AWS.Signers.V4(request, service);
  signer.addAuthorization(credentials, new Date());
}

async function getResolvedCredentials(AWS) {
  if (AWS.config.credentials?.accessKeyId && AWS.config.credentials?.secretAccessKey) {
    return AWS.config.credentials;
  }

  await new Promise((resolve, reject) => {
    AWS.config.getCredentials((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return AWS.config.credentials;
}

function parseJsonBody(responseBody) {
  if (!responseBody) {
    return null;
  }

  try {
    return JSON.parse(responseBody);
  } catch {
    return { message: responseBody };
  }
}

module.exports = {
  buildS3ObjectUrl,
  decodeS3Key,
  normalizeLabel,
  parseJsonBody,
  requestJson,
  getResolvedCredentials,
  signOpenSearchRequest,
  splitLabels,
  toIsoTimestamp,
  uniqueLabels
};
