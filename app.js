/*
  AI Photo Search frontend
  Assignment-aligned behavior with API integration and static fallback.
*/

const APP_CONFIG = {
  apiBaseUrl: "", // Example: "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
  apiKey: "",
  searchPath: "/search",
  uploadPath: "/photos", // Set to "/upload" if your deployed API uses that route.
  s3PhotosBaseUrl: "" // Example: "https://your-photo-bucket.s3.amazonaws.com"
};

const IGNORED_SEARCH_WORDS = new Set([
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
  "them"
]);

const API_MODE_ENABLED = Boolean(APP_CONFIG.apiBaseUrl.trim());

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const uploadForm = document.getElementById("upload-form");
const photoInput = document.getElementById("photo-input");
const labelsInput = document.getElementById("labels-input");
const previewBox = document.getElementById("preview-box");
const statusMessage = document.getElementById("status-message");
const resultsSummary = document.getElementById("results-summary");
const resultsGallery = document.getElementById("results-gallery");

let photoDataset = createSeedPhotoDataset();
let selectedPreviewUrl = "";
const uploadedPreviewUrls = [];

searchForm.addEventListener("submit", handleSearchSubmit);
uploadForm.addEventListener("submit", handleUploadSubmit);
photoInput.addEventListener("change", handleFileSelection);
window.addEventListener("beforeunload", cleanupObjectUrls);

renderGallery(photoDataset);
setStatus(
  API_MODE_ENABLED
    ? "API mode enabled. Search and uploads use your API Gateway endpoints."
    : "Static mode enabled. Configure APP_CONFIG.apiBaseUrl in app.js to call your API.",
  "info"
);

function createSeedPhotoDataset() {
  return [
    {
      objectKey: "vehicles.jpg",
      imageUrl: "assets/vehicles.jpg",
      labels: ["vehicle", "car", "truck", "bus", "motorcycle"]
    },
    {
      objectKey: "menu.jpg",
      imageUrl: "assets/menu.jpg",
      labels: ["food", "meal", "restaurant", "menu", "dining"]
    },
    {
      objectKey: "people.jpg",
      imageUrl: "assets/people.jpg",
      labels: ["people", "friends", "group", "smile", "outdoor"]
    },
    {
      objectKey: "trees.jpg",
      imageUrl: "assets/trees.jpg",
      labels: ["trees", "forest", "nature", "park", "outdoor"]
    },
    {
      objectKey: "cats.jpg",
      imageUrl: "assets/cats.jpg",
      labels: ["cat", "cats", "kitten", "pets", "animals"]
    },
    {
      objectKey: "dogs.jpg",
      imageUrl: "assets/dogs.jpg",
      labels: ["dog", "dogs", "pet", "animals", "breeds"]
    },
    {
      objectKey: "dog-park.jpg",
      imageUrl: "assets/dog-park.jpg",
      labels: ["dog", "dogs", "park", "grass", "outdoor"]
    },
    {
      objectKey: "nyc-park.jpg",
      imageUrl: "assets/nyc-park.jpg",
      labels: ["park", "nyc", "city", "people", "lawn"]
    }
  ];
}

async function handleSearchSubmit(event) {
  event.preventDefault();

  const rawQuery = searchInput.value.trim();
  if (!rawQuery) {
    setStatus("Enter a search phrase before running a search.", "error");
    renderEmptyState("No matches yet. Try a search like \"show me dogs\" or \"show me trees and park\".");
    resultsSummary.textContent = "Search query is required.";
    return;
  }

  try {
    if (API_MODE_ENABLED) {
      const apiResults = await searchPhotosViaApi(rawQuery);
      renderGallery(apiResults);
      resultsSummary.textContent = `Showing ${apiResults.length} API result${apiResults.length === 1 ? "" : "s"} for \"${rawQuery}\".`;
      setStatus(`Search completed via GET ${APP_CONFIG.searchPath}.`, "success");
      return;
    }

    const matches = searchMockPhotos(rawQuery, photoDataset);
    renderGallery(matches);

    if (matches.length === 0) {
      setStatus(`No photos matched \"${rawQuery}\" in static mode.`, "info");
      return;
    }

    setStatus(`Found ${matches.length} matching photo${matches.length === 1 ? "" : "s"} in static mode.`, "success");
  } catch (error) {
    setStatus(`Search failed: ${error.message}`, "error");
    renderEmptyState("Search request failed. Confirm your API URL, API key, and deployed routes.");
    resultsSummary.textContent = "Search failed.";
  }
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  const selectedFile = photoInput.files[0];
  if (!selectedFile) {
    setStatus("Select an image file before clicking Upload.", "error");
    return;
  }

  if (!isImageFile(selectedFile)) {
    setStatus("The selected file is not a supported image.", "error");
    return;
  }

  const rawCustomLabels = parseCustomLabels(labelsInput.value, false);
  const normalizedLabels = parseCustomLabels(labelsInput.value, true);
  const previewUrl = getActivePreviewUrl();

  try {
    if (API_MODE_ENABLED) {
      await uploadPhotoViaApi(selectedFile, rawCustomLabels);
      setStatus(
        rawCustomLabels.length
          ? `Upload completed via PUT ${APP_CONFIG.uploadPath} with x-amz-meta-customLabels: ${rawCustomLabels.join(", ")}`
          : `Upload completed via PUT ${APP_CONFIG.uploadPath} without custom labels.`,
        "success"
      );
    } else {
      setStatus("Static mode: photo staged locally. Configure API settings to upload to S3 via API Gateway.", "info");
    }

    const newEntry = {
      objectKey: selectedFile.name,
      imageUrl: previewUrl,
      labels: normalizedLabels.length ? normalizedLabels : ["user-upload"]
    };

    photoDataset = [newEntry, ...photoDataset];
    uploadedPreviewUrls.push(previewUrl);
    renderGallery(photoDataset);
    resultsSummary.textContent = `Showing ${photoDataset.length} photo${photoDataset.length === 1 ? "" : "s"} including your new upload.`;

    uploadForm.reset();
    clearPreview(false);
  } catch (error) {
    setStatus(`Upload failed: ${error.message}`, "error");
  }
}

function handleFileSelection() {
  const selectedFile = photoInput.files[0];

  if (!selectedFile) {
    clearPreview();
    return;
  }

  if (!isImageFile(selectedFile)) {
    clearPreview();
    setStatus("Please choose an image file for preview.", "error");
    return;
  }

  setPreviewImage(selectedFile);
  setStatus(`Preview loaded for \"${selectedFile.name}\".`, "info");
}

async function searchPhotosViaApi(query) {
  const url = new URL(`${APP_CONFIG.apiBaseUrl}${APP_CONFIG.searchPath}`);
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildApiHeaders()
  });

  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return normalizeApiResults(payload);
}

async function uploadPhotoViaApi(file, customLabels) {
  const url = `${APP_CONFIG.apiBaseUrl}${APP_CONFIG.uploadPath}`;
  const headers = buildApiHeaders({
    "Content-Type": file.type || "application/octet-stream"
  });

  if (customLabels.length) {
    headers["x-amz-meta-customLabels"] = customLabels.join(", ");
  }

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: file
  });

  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return payload;
}

function buildApiHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };

  if (APP_CONFIG.apiKey.trim()) {
    headers["x-api-key"] = APP_CONFIG.apiKey.trim();
  }

  return headers;
}

function normalizeApiResults(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return raw.map((item, index) => {
    if (typeof item === "string") {
      return {
        objectKey: deriveObjectKey(item, index),
        imageUrl: resolveImageReference(item),
        labels: []
      };
    }

    const url = item?.url || item?.imageUrl || item?.objectKey || "";
    const labels = Array.isArray(item?.labels) ? item.labels.map((label) => String(label).toLowerCase()) : [];

    return {
      objectKey: item?.objectKey || deriveObjectKey(url, index),
      imageUrl: resolveImageReference(url),
      labels
    };
  }).filter((photo) => Boolean(photo.imageUrl));
}

function resolveImageReference(value) {
  const ref = String(value || "").trim();
  if (!ref) {
    return "";
  }

  if (/^(https?:|data:|blob:|assets\/|\.\/assets\/)/i.test(ref)) {
    return ref;
  }

  if (APP_CONFIG.s3PhotosBaseUrl.trim()) {
    const base = APP_CONFIG.s3PhotosBaseUrl.replace(/\/$/, "");
    const key = ref.replace(/^\//, "");
    return `${base}/${key}`;
  }

  return ref;
}

function deriveObjectKey(value, fallbackIndex) {
  const raw = String(value || "").trim();
  if (!raw) {
    return `result-${fallbackIndex + 1}.jpg`;
  }

  const withoutQuery = raw.split("?")[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] || `result-${fallbackIndex + 1}.jpg`;
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function searchMockPhotos(query, dataset) {
  const usefulKeywords = getUsefulKeywords(query);
  if (!usefulKeywords.length) {
    resultsSummary.textContent = "No useful search keywords were found.";
    renderEmptyState("Try a more specific search, such as \"dogs\", \"park\", or \"friends\".");
    return [];
  }

  const matches = dataset.filter((photo) => photoMatchesKeywords(photo, usefulKeywords));
  resultsSummary.textContent = `Showing ${matches.length} result${matches.length === 1 ? "" : "s"} for keywords: ${usefulKeywords.join(", ")}.`;
  return matches;
}

function getUsefulKeywords(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word && !IGNORED_SEARCH_WORDS.has(word));
}

function photoMatchesKeywords(photo, keywords) {
  const searchableText = `${photo.objectKey} ${photo.labels.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => searchableText.includes(keyword));
}

function parseCustomLabels(rawValue, normalizeToLower) {
  return rawValue
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => normalizeToLower ? label.toLowerCase() : label);
}

function renderGallery(photos) {
  resultsGallery.innerHTML = "";

  if (!photos.length) {
    renderEmptyState("No matching photos found. Try a different search or upload a new photo.");
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "photo-card";

    const labelsMarkup = (photo.labels || [])
      .map((label) => `<span class="tag">${escapeHtml(label)}</span>`)
      .join("");

    const labelsBlock = labelsMarkup || '<span class="tag">no-labels-returned</span>';

    card.innerHTML = `
      <div class="photo-frame">
        <img src="${escapeAttribute(photo.imageUrl)}" alt="${escapeAttribute(photo.objectKey)}" loading="lazy">
      </div>
      <div class="photo-details">
        <div>
          <span class="detail-label">Filename</span>
          <p class="file-name">${escapeHtml(photo.objectKey)}</p>
        </div>
        <div>
          <span class="detail-label">Labels</span>
          <div class="tag-list">${labelsBlock}</div>
        </div>
      </div>
    `;

    resultsGallery.appendChild(card);
  });
}

function renderEmptyState(message) {
  resultsGallery.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function setPreviewImage(file) {
  releaseSelectedPreviewUrl();
  selectedPreviewUrl = URL.createObjectURL(file);
  previewBox.innerHTML = `<img src="${escapeAttribute(selectedPreviewUrl)}" alt="${escapeAttribute(file.name)}">`;
}

function getActivePreviewUrl() {
  const selectedFile = photoInput.files[0];

  if (!selectedFile) {
    return "";
  }

  if (!selectedPreviewUrl) {
    selectedPreviewUrl = URL.createObjectURL(selectedFile);
  }

  return selectedPreviewUrl;
}

function clearPreview(revokeUrl = true) {
  if (revokeUrl) {
    releaseSelectedPreviewUrl();
  } else {
    selectedPreviewUrl = "";
  }

  previewBox.innerHTML = '<p class="placeholder-text">Choose an image to preview it here.</p>';
}

function releaseSelectedPreviewUrl() {
  if (!selectedPreviewUrl) {
    return;
  }

  URL.revokeObjectURL(selectedPreviewUrl);
  selectedPreviewUrl = "";
}

function cleanupObjectUrls() {
  releaseSelectedPreviewUrl();
  uploadedPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
}

function setStatus(message, type) {
  const safeType = ["info", "success", "error"].includes(type) ? type : "info";
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${safeType}`;
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|gif|bmp|webp|svg|avif)$/i.test(file.name);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
