/*
  AI Photo Search frontend.
  Backend-driven version:
  - No mock gallery on page load.
  - Search results come only from API Gateway/LF2/OpenSearch.
  - Images are rendered from S3 bucket2 using objectKey.
  - Upload sends image to API Gateway/S3 with optional custom labels.
*/

const APP_CONFIG = {
  apiBaseUrl: "https://oak67t1655.execute-api.us-east-1.amazonaws.com/prod",
  apiKey: "IGJnrbsgLY5hLb8BxMjHQuwH9Zq8xmz83P5HaMai",
  searchPath: "/search", 
  uploadPath: "/photos",
  s3PhotosBaseUrl: "https://cc-hw3-bucket2.s3.amazonaws.com"
};

const PREVIEW_PLACEHOLDER_MARKUP = `
  <div class="preview-placeholder">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
    <p>Choose an image to preview it here before upload.</p>
  </div>
`;

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const uploadForm = document.getElementById("upload-form");
const uploadButton = document.getElementById("upload-button");
const photoInput = document.getElementById("photo-input");
const labelsInput = document.getElementById("labels-input");
const previewBox = document.getElementById("preview-box");
const statusMessage = document.getElementById("status-message");
const resultsSummary = document.getElementById("results-summary");
const resultsGallery = document.getElementById("results-gallery");

let selectedPreviewUrl = "";

searchForm.addEventListener("submit", handleSearchSubmit);
uploadForm.addEventListener("submit", handleUploadSubmit);
photoInput.addEventListener("change", handleFileSelection);
window.addEventListener("beforeunload", releaseSelectedPreviewUrl);

initializePage();

function initializePage() {
  resultsSummary.textContent = "No search yet.";
  renderEmptyState('Search your S3 album using a phrase like "show me dogs", "beach", or a custom label.');
  setStatus("Ready. Search your S3 photo album or upload a new image.", "info");
}

async function handleSearchSubmit(event) {
  event.preventDefault();

  const query = searchInput.value.trim();

  if (!query) {
    setStatus("Enter a search phrase before running a search.", "error");
    resultsSummary.textContent = "Search query is required.";
    renderEmptyState('Try a search like "dogs", "cars", "beach", or "Sam".');
    return;
  }

  setButtonBusy(searchButton, true, "Searching...");
  setStatus(`Searching for "${query}"...`, "info");
  resultsSummary.textContent = "Searching...";
  renderEmptyState("Searching your indexed photo album...");

  try {
    const apiResults = await searchPhotosViaApi(query);

    renderGallery(apiResults);
    resultsSummary.textContent = `${apiResults.length} result${apiResults.length === 1 ? "" : "s"} for "${query}"`;

    if (apiResults.length) {
      setStatus("Search completed successfully.", "success");
    } else {
      setStatus(`No matching photos found for "${query}".`, "info");
    }
  } catch (error) {
    console.error("Search failed:", error);
    setStatus(`Search failed: ${error.message}`, "error");
    resultsSummary.textContent = "Search failed.";
    renderEmptyState("Search request failed. Check API Gateway, Lambda, Lex, and OpenSearch logs.");
  } finally {
    setButtonBusy(searchButton, false, "Search");
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

  const customLabels = parseCustomLabels(labelsInput.value);

  setButtonBusy(uploadButton, true, "Uploading...");
  setStatus(`Uploading "${selectedFile.name}"...`, "info");

  try {
    await uploadPhotoViaApi(selectedFile, customLabels);

    const labelMessage = customLabels.length
      ? ` with custom labels: ${customLabels.join(", ")}`
      : "";

    setStatus(
      `Uploaded "${selectedFile.name}"${labelMessage}. Wait a few seconds for Lambda/Rekognition indexing, then search for it.`,
      "success"
    );

    resultsSummary.textContent = "Upload complete. Search to view indexed results.";
    // Do not inject local upload previews into the gallery; gallery is search-result only.
    if (!galleryHasSearchResults()) {
      renderEmptyState("Upload successful. Wait a few seconds for indexing, then search for the photo using a detected or custom label.");
    }

    uploadForm.reset();
    clearPreview();
  } catch (error) {
    console.error("Upload failed:", error);
    setStatus(`Upload failed: ${error.message}`, "error");
  } finally {
    setButtonBusy(uploadButton, false, "Upload Photo");
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
    setStatus("Please choose a valid image file.", "error");
    return;
  }

  setPreviewImage();
  setStatus(`Preview loaded for "${selectedFile.name}".`, "info");
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
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }

  return normalizeApiResults(payload);
}

async function uploadPhotoViaApi(file, customLabels) {
  const objectKey = encodeURIComponent(file.name);
  const url = `${APP_CONFIG.apiBaseUrl}${APP_CONFIG.uploadPath}/${objectKey}`;

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
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

function buildApiHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };

  if (APP_CONFIG.apiKey && APP_CONFIG.apiKey.trim()) {
    headers["x-api-key"] = APP_CONFIG.apiKey.trim();
  }

  return headers;
}

function normalizeApiResults(payload) {
  const rawResults = extractRawResults(payload);

  return rawResults
    .map((item, index) => normalizeOneResult(item, index))
    .filter((photo) => Boolean(photo.objectKey || photo.imageUrl));
}

function extractRawResults(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.photos)) {
    return payload.photos;
  }

  if (Array.isArray(payload?.hits)) {
    return payload.hits;
  }

  if (Array.isArray(payload?.body?.results)) {
    return payload.body.results;
  }

  if (typeof payload?.body === "string") {
    try {
      const parsedBody = JSON.parse(payload.body);
      return extractRawResults(parsedBody);
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeOneResult(item, index) {
  if (typeof item === "string") {
    const objectKey = deriveObjectKey(item, index);
    return {
      objectKey,
      imageUrl: resolveImageReference(item || objectKey),
      labels: []
    };
  }

  const source = item?._source || item?.source || item || {};

  const objectKey =
    source.objectKey ||
    source.key ||
    source.filename ||
    source.fileName ||
    deriveObjectKey(source.url || source.imageUrl || "", index);

  const imageReference =
    source.url ||
    source.imageUrl ||
    source.s3Url ||
    objectKey;

  const labels = Array.isArray(source.labels)
    ? source.labels.map((label) => String(label).toLowerCase())
    : [];

  return {
    objectKey,
    imageUrl: resolveImageReference(imageReference || objectKey),
    labels
  };
}

function resolveImageReference(value) {
  const reference = String(value || "").trim();

  if (!reference) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(reference)) {
    return reference;
  }

  const cleanKey = reference.replace(/^\/+/, "");
  const base = APP_CONFIG.s3PhotosBaseUrl.replace(/\/$/, "");

  return `${base}/${encodeS3Key(cleanKey)}`;
}

function encodeS3Key(key) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function deriveObjectKey(value, fallbackIndex) {
  const raw = String(value || "").trim();

  if (!raw) {
    return `result-${fallbackIndex + 1}.jpg`;
  }

  const withoutQuery = raw.split("?")[0];
  const segments = withoutQuery.split("/").filter(Boolean);

  return decodeURIComponent(segments[segments.length - 1] || `result-${fallbackIndex + 1}.jpg`);
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

function parseCustomLabels(rawValue) {
  return rawValue
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function renderGallery(photos) {
  resultsGallery.innerHTML = "";

  if (!photos.length) {
    renderEmptyState("No matching photos found. Try a different search term.");
    return;
  }

  photos.forEach((photo, index) => {
    resultsGallery.appendChild(createPhotoCard(photo, index));
  });
}

function galleryHasSearchResults() {
  return Boolean(resultsGallery.querySelector(".photo-card"));
}

function createPhotoCard(photo, index) {
  const card = document.createElement("article");
  card.className = "photo-card";
  card.style.animationDelay = `${index * 45}ms`;

  const labelsMarkup = Array.isArray(photo.labels) && photo.labels.length
    ? photo.labels.map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join("")
    : '<span class="tag">no labels returned</span>';

  const imageUrl = photo.imageUrl || resolveImageReference(photo.objectKey);

  card.innerHTML = `
    <div class="photo-frame">
      <img
        src="${escapeAttribute(imageUrl)}"
        alt="${escapeAttribute(photo.objectKey || "photo result")}"
        loading="lazy"
        onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=&quot;image-fallback&quot;>Image could not be loaded from S3</div>');"
      >
    </div>
    <div class="photo-details">
      <div>
        <span class="detail-label">Filename</span>
        <p class="file-name">${escapeHtml(photo.objectKey || "Unknown file")}</p>
      </div>
      <div>
        <span class="detail-label">Labels</span>
        <div class="tag-list">${labelsMarkup}</div>
      </div>
    </div>
  `;

  return card;
}

function renderEmptyState(message) {
  resultsGallery.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function setPreviewImage() {
  const activeFile = photoInput.files[0];

  if (!activeFile) {
    clearPreview();
    return;
  }

  releaseSelectedPreviewUrl();
  const previewUrl = getActivePreviewUrl();
  previewBox.innerHTML = `<img src="${escapeAttribute(previewUrl)}" alt="${escapeAttribute(activeFile.name)}">`;
}

function getActivePreviewUrl() {
  const activeFile = photoInput.files[0];

  if (!activeFile) {
    return "";
  }

  if (!selectedPreviewUrl) {
    selectedPreviewUrl = URL.createObjectURL(activeFile);
  }

  return selectedPreviewUrl;
}

function clearPreview() {
  releaseSelectedPreviewUrl();
  previewBox.innerHTML = PREVIEW_PLACEHOLDER_MARKUP;
}

function releaseSelectedPreviewUrl() {
  if (!selectedPreviewUrl) {
    return;
  }

  URL.revokeObjectURL(selectedPreviewUrl);
  selectedPreviewUrl = "";
}

function setStatus(message, type) {
  const safeType = ["info", "success", "error"].includes(type) ? type : "info";
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${safeType}`;
}

function setButtonBusy(button, isBusy, busyLabel, idleLabel = null) {
  const labelNode = button.querySelector("span");
  const defaultLabel = idleLabel || button.dataset.defaultLabel || labelNode.textContent;

  button.dataset.defaultLabel = defaultLabel;
  button.disabled = isBusy;
  button.classList.toggle("is-busy", isBusy);
  button.setAttribute("aria-busy", String(isBusy));
  labelNode.textContent = isBusy ? busyLabel : defaultLabel;
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|gif|bmp|webp|svg|avif)$/i.test(file.name);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}


// Hello/ /   t r i g g e r   0 4 / 2 6 / 2 0 2 6   0 2 : 1 1 : 5 9  
 