/*
  AI Photo Search
  Phase 1 static frontend only.

  This file intentionally avoids real API calls so it can be uploaded
  directly to an S3 static website bucket for the initial prototype.
*/

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
  "my"
]);

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const uploadForm = document.getElementById("upload-form");
const photoInput = document.getElementById("photo-input");
const labelsInput = document.getElementById("labels-input");
const previewBox = document.getElementById("preview-box");
const statusMessage = document.getElementById("status-message");
const resultsSummary = document.getElementById("results-summary");
const resultsGallery = document.getElementById("results-gallery");

// This array acts as a temporary in-browser photo dataset for the demo.
let photoDataset = createMockPhotoDataset();
let selectedPreviewUrl = "";
const uploadedPreviewUrls = [];

searchForm.addEventListener("submit", handleSearchSubmit);
uploadForm.addEventListener("submit", handleUploadSubmit);
photoInput.addEventListener("change", handleFileSelection);
window.addEventListener("beforeunload", cleanupObjectUrls);

renderGallery(photoDataset);

function createMockPhotoDataset() {
  return [
    createPhotoEntry("dog-park.jpg", ["dog", "park", "grass"], "#cce3a8", "#5f7d2b"),
    createPhotoEntry("cat-sofa.jpg", ["cat", "sofa", "indoor"], "#f6d8b8", "#8a5335"),
    createPhotoEntry("beach-friends.jpg", ["person", "beach", "sunset", "sam", "sally"], "#f7c78a", "#ad5b35"),
    createPhotoEntry("laptop-desk.jpg", ["laptop", "desk", "workspace"], "#cfd9e8", "#395677"),
    createPhotoEntry("car-road.jpg", ["car", "road", "outdoor"], "#c7d7dd", "#35535f"),
    createPhotoEntry("city-night.jpg", ["city", "night", "lights"], "#c9c3f4", "#433b88")
  ];
}

function createPhotoEntry(filename, labels, startColor, endColor) {
  return {
    objectKey: filename,
    imageUrl: buildPlaceholderImage(filename, labels, startColor, endColor),
    labels: [...labels]
  };
}

function buildPlaceholderImage(filename, labels, startColor, endColor) {
  const accentLabel = labels.slice(0, 2).join(" / ");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" role="img" aria-label="${escapeHtml(filename)}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg)" />
      <circle cx="520" cy="105" r="62" fill="rgba(255,255,255,0.22)" />
      <rect x="64" y="300" width="512" height="98" rx="24" fill="rgba(255,255,255,0.18)" />
      <text x="64" y="138" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">${escapeHtml(filename)}</text>
      <text x="64" y="202" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#ffffff">${escapeHtml(accentLabel)}</text>
      <text x="64" y="356" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#ffffff">Mock photo preview for the static frontend demo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function handleSearchSubmit(event) {
  event.preventDefault();

  const rawQuery = searchInput.value.trim();
  if (!rawQuery) {
    setStatus("Enter a search phrase before running a search.", "error");
    renderEmptyState("No matches yet. Try a search like \"show me dogs\" or \"show me Sam at the beach\".");
    resultsSummary.textContent = "Search query is required.";
    return;
  }

  const matches = searchMockPhotos(rawQuery, photoDataset);
  renderGallery(matches);

  if (matches.length === 0) {
    setStatus(`No photos matched "${rawQuery}".`, "info");
    return;
  }

  setStatus(`Found ${matches.length} matching photo${matches.length === 1 ? "" : "s"} for "${rawQuery}".`, "success");
}

function handleUploadSubmit(event) {
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
  const previewUrl = getActivePreviewUrl();

  const newEntry = {
    objectKey: selectedFile.name,
    imageUrl: previewUrl,
    labels: customLabels.length ? customLabels : ["user-upload"]
  };

  photoDataset = [newEntry, ...photoDataset];
  uploadedPreviewUrls.push(previewUrl);
  renderGallery(photoDataset);
  resultsSummary.textContent = `Showing ${photoDataset.length} photo${photoDataset.length === 1 ? "" : "s"} including your temporary upload.`;

  setStatus("Photo is ready for upload to S3 in the AWS integration phase.", "success");

  uploadForm.reset();
  clearPreview(false);
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

function searchMockPhotos(query, dataset) {
  const usefulKeywords = getUsefulKeywords(query);
  if (!usefulKeywords.length) {
    resultsSummary.textContent = "No useful search keywords were found.";
    renderEmptyState("Try a more specific search, such as \"dogs\", \"beach\", or \"Sam\".");
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

function parseCustomLabels(rawValue) {
  return rawValue
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

function renderGallery(photos) {
  resultsGallery.innerHTML = "";

  if (!photos.length) {
    renderEmptyState("No matching photos found. Try a different search or add a new photo.");
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "photo-card";

    const labelsMarkup = photo.labels
      .map((label) => `<span class="tag">${escapeHtml(label)}</span>`)
      .join("");

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

  return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(file.name);
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
