/*
  AI Photo Search frontend
  Assignment-aligned behavior with live API integration and local fallback data.
*/

const APP_CONFIG = {
  apiBaseUrl: "",
  apiKey: "",
  searchPath: "/search",
  uploadPath: "/photos",
  s3PhotosBaseUrl: ""
};

const IGNORED_SEARCH_WORDS = new Set([
  "show", "me", "photo", "photos", "image", "images",
  "with", "the", "and", "a", "an", "at", "in", "of",
  "my", "please", "find", "for", "them"
]);

const PREVIEW_PLACEHOLDER_MARKUP = `
  <div class="preview-placeholder">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
    <p>Choose an image to preview it here before upload.</p>
  </div>
`;

const API_MODE_ENABLED = Boolean(APP_CONFIG.apiBaseUrl.trim());

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

let photoDataset = createSeedPhotoDataset();
let selectedPreviewUrl = "";
const uploadedPreviewUrls = [];

searchForm.addEventListener("submit", handleSearchSubmit);
uploadForm.addEventListener("submit", handleUploadSubmit);
photoInput.addEventListener("change", handleFileSelection);
window.addEventListener("beforeunload", cleanupObjectUrls);

renderGallery(photoDataset);
resultsSummary.textContent = `Showing ${photoDataset.length} sample photos.`;
setStatus(
  API_MODE_ENABLED
    ? "API mode active. Search and uploads use your deployed API Gateway endpoints."
    : "Static mode active. Configure APP_CONFIG.apiBaseUrl in app.js to call your API.",
  "info"
);

function createSeedPhotoDataset() {
  return [
    { objectKey: "vehicles.jpg", imageUrl: "assets/vehicles.jpg", labels: ["vehicle", "vehicles", "car", "truck", "bus"] },
    { objectKey: "menu.jpg", imageUrl: "assets/menu.jpg", labels: ["menu", "restaurant", "food", "dining", "meal"] },
    { objectKey: "people.jpg", imageUrl: "assets/people.jpg", labels: ["people", "person", "group", "friends", "outdoor"] },
    { objectKey: "trees.jpg", imageUrl: "assets/trees.jpg", labels: ["trees", "tree", "forest", "nature", "park"] },
    { objectKey: "cats.jpg", imageUrl: "assets/cats.jpg", labels: ["cat", "cats", "kitten", "pets", "animals"] },
    { objectKey: "dogs.jpg", imageUrl: "assets/dogs.jpg", labels: ["dog", "dogs", "puppy", "pets", "animals"] },
    { objectKey: "dog-park.jpg", imageUrl: "assets/dog-park.jpg", labels: ["dog", "dogs", "park", "grass", "outdoor"] },
    { objectKey: "nyc-park.jpg", imageUrl: "assets/nyc-park.jpg", labels: ["park", "nyc", "city", "people", "lawn"] },
    { objectKey: "beach-1.jpg", imageUrl: "assets/beach-1.jpg", labels: ["beach", "ocean", "sand", "shore", "outdoor"] },
    { objectKey: "beach-2.jpg", imageUrl: "assets/beach-2.jpg", labels: ["beach", "water", "sky", "shore", "outdoor"] },
    { objectKey: "sunset-1.jpg", imageUrl: "assets/sunset-1.jpg", labels: ["sunset", "sky", "sun", "horizon", "outdoor"] },
    { objectKey: "sunset-2.jpg", imageUrl: "assets/sunset-2.jpg", labels: ["sunset", "evening", "sky", "clouds", "outdoor"] },
    { objectKey: "mountain-1.jpg", imageUrl: "assets/mountain-1.jpg", labels: ["mountain", "peak", "nature", "landscape", "outdoor"] },
    { objectKey: "lake-1.jpg", imageUrl: "assets/lake-1.jpg", labels: ["lake", "water", "reflection", "nature", "outdoor"] },
    { objectKey: "lake-2.jpg", imageUrl: "assets/lake-2.jpg", labels: ["lake", "shore", "trees", "water", "outdoor"] },
    { objectKey: "city-street-2.jpg", imageUrl: "assets/city-street-2.jpg", labels: ["city", "street", "road", "traffic", "urban"] },
    { objectKey: "laptop-desk-1.jpg", imageUrl: "assets/laptop-desk-1.jpg", labels: ["laptop", "desk", "workspace", "computer", "office"] },
    { objectKey: "laptop-desk-2.jpg", imageUrl: "assets/laptop-desk-2.jpg", labels: ["laptop", "desk", "keyboard", "workspace", "office"] },
    { objectKey: "phone-1.jpg", imageUrl: "assets/phone-1.jpg", labels: ["phone", "smartphone", "device", "screen", "table"] },
    { objectKey: "bicycle-2.jpg", imageUrl: "assets/bicycle-2.jpg", labels: ["bicycle", "bike", "transport", "road", "outdoor"] },
    { objectKey: "bottle-1.jpg", imageUrl: "assets/bottle-1.jpg", labels: ["bottle", "drink", "beverage", "table", "glass"] },
    { objectKey: "bottle-2.jpg", imageUrl: "assets/bottle-2.jpg", labels: ["bottle", "water", "drink", "beverage", "table"] },
    { objectKey: "car-1.jpg", imageUrl: "assets/car-1.jpg", labels: ["car", "vehicle", "road", "transport", "outdoor"] },
    { objectKey: "car-2.jpg", imageUrl: "assets/car-2.jpg", labels: ["car", "vehicle", "parking", "road", "transport"] },
    { objectKey: "burger-1.jpg", imageUrl: "assets/burger-1.jpg", labels: ["burger", "food", "meal", "sandwich", "dining"] },
    { objectKey: "burger-2.jpg", imageUrl: "assets/burger-2.jpg", labels: ["burger", "fries", "food", "meal", "dining"] },
    { objectKey: "coffee-1.jpg", imageUrl: "assets/coffee-1.jpg", labels: ["coffee", "cup", "drink", "table", "beverage"] },
    { objectKey: "coffee-2.jpg", imageUrl: "assets/coffee-2.jpg", labels: ["coffee", "mug", "cafe", "drink", "beverage"] },
    { objectKey: "duck.jpg", imageUrl: "assets/duck.jpg", labels: ["duck", "bird", "water", "lake", "wildlife"] }
  ];
}

async function handleSearchSubmit(event) {
  event.preventDefault();

  const rawQuery = searchInput.value.trim();
  if (!rawQuery) {
    setStatus("Enter a search phrase before running a search.", "error");
    resultsSummary.textContent = "Search query is required.";
    renderEmptyState('No matches yet. Try a search like "show me dogs" or "trees and park".');
    return;
  }

  setButtonBusy(searchButton, true, "Searching...");
  setStatus("Searching...", "info");

  try {
    if (API_MODE_ENABLED) {
      const apiResults = await searchPhotosViaApi(rawQuery);
      renderGallery(apiResults);
      resultsSummary.textContent = `${apiResults.length} result${apiResults.length === 1 ? "" : "s"} for "${rawQuery}"`;
      setStatus(
        apiResults.length
          ? "Search completed successfully."
          : `No API results matched "${rawQuery}".`,
        apiResults.length ? "success" : "info"
      );
      return;
    }

    const matches = searchMockPhotos(rawQuery, photoDataset);
    renderGallery(matches);
    setStatus(
      matches.length
        ? `Found ${matches.length} matching photo${matches.length === 1 ? "" : "s"} in static mode.`
        : `No photos matched "${rawQuery}" in static mode.`,
      matches.length ? "success" : "info"
    );
  } catch (error) {
    setStatus(`Search failed: ${error.message}`, "error");
    resultsSummary.textContent = "Search failed.";
    renderEmptyState("Search request failed. Confirm your API URL, key, and deployed routes.");
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

  const rawCustomLabels = parseCustomLabels(labelsInput.value, false);
  const normalizedLabels = parseCustomLabels(labelsInput.value, true);
  const previewUrl = getActivePreviewUrl();

  setButtonBusy(uploadButton, true, "Uploading...");
  setStatus("Uploading...", "info");

  try {
    if (API_MODE_ENABLED) {
      await uploadPhotoViaApi(selectedFile, rawCustomLabels);
      setStatus(
        rawCustomLabels.length
          ? `Uploaded "${selectedFile.name}" with custom labels: ${rawCustomLabels.join(", ")}`
          : `Uploaded "${selectedFile.name}" successfully. Rekognition will detect labels automatically.`,
        "success"
      );
    } else {
      setStatus("Static mode active. The photo was staged locally but not sent to S3.", "info");
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
    setStatus("Please choose an image file for preview.", "error");
    return;
  }

  setPreviewImage(selectedFile);
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
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return normalizeApiResults(payload);
}

async function uploadPhotoViaApi(file, customLabels) {
  const url = `${APP_CONFIG.apiBaseUrl}${APP_CONFIG.uploadPath}/${encodeURIComponent(file.name)}`;
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
  const rawResults = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return rawResults
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          objectKey: deriveObjectKey(item, index),
          imageUrl: resolveImageReference(item),
          labels: []
        };
      }

      const imageReference = item?.url || item?.imageUrl || item?.objectKey || "";
      const labels = Array.isArray(item?.labels)
        ? item.labels.map((label) => String(label).toLowerCase())
        : [];

      return {
        objectKey: item?.objectKey || deriveObjectKey(imageReference, index),
        imageUrl: resolveImageReference(imageReference),
        labels
      };
    })
    .filter((photo) => Boolean(photo.imageUrl));
}

function resolveImageReference(value) {
  const reference = String(value || "").trim();
  if (!reference) {
    return "";
  }

  if (/^(https?:|data:|blob:|assets\/|\.\/assets\/)/i.test(reference)) {
    return reference;
  }

  if (APP_CONFIG.s3PhotosBaseUrl.trim()) {
    const base = APP_CONFIG.s3PhotosBaseUrl.replace(/\/$/, "");
    return `${base}/${reference.replace(/^\//, "")}`;
  }

  return reference;
}

function deriveObjectKey(value, fallbackIndex) {
  const raw = String(value || "").trim();
  if (!raw) {
    return `result-${fallbackIndex + 1}.jpg`;
  }

  const segments = raw.split("?")[0].split("/").filter(Boolean);
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
    resultsSummary.textContent = "No useful search keywords found.";
    renderEmptyState('Try a specific search like "dogs", "park", or "sunset".');
    return [];
  }

  const matches = dataset.filter((photo) => photoMatchesKeywords(photo, usefulKeywords));
  resultsSummary.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} for: ${usefulKeywords.join(", ")}`;
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

  photos.forEach((photo, index) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.style.animationDelay = `${index * 45}ms`;

    const labelsMarkup = (photo.labels || [])
      .map((label) => `<span class="tag">${escapeHtml(label)}</span>`)
      .join("") || '<span class="tag">no labels</span>';

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
          <div class="tag-list">${labelsMarkup}</div>
        </div>
      </div>
    `;

    resultsGallery.appendChild(card);
  });
}

function renderEmptyState(message) {
  resultsGallery.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function setPreviewImage(file) {
  releaseSelectedPreviewUrl();
  selectedPreviewUrl = URL.createObjectURL(file);
  previewBox.innerHTML = `<img src="${escapeAttribute(selectedPreviewUrl)}" alt="${escapeAttribute(file.name)}">`;
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

function clearPreview(revokeUrl = true) {
  if (revokeUrl) {
    releaseSelectedPreviewUrl();
  } else {
    selectedPreviewUrl = "";
  }

  previewBox.innerHTML = PREVIEW_PLACEHOLDER_MARKUP;
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
