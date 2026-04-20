# Cloud Computing HW-3 (Assignment 3 Frontend)

Frontend for AI Photo Search with:
- natural-language search UI (`GET /search`)
- photo upload UI with custom labels header (`PUT /photos` by default)
- static fallback mode for local preview/testing

## Repository Contents

- `index.html`
- `styles.css`
- `app.js`
- `assets/vehicles.jpg`
- `assets/menu.jpg`
- `assets/people.jpg`
- `assets/trees.webp`
- `assets/cats.avif`
- `assets/dogs.jpg`
- `assets/dog-park.png`
- `assets/nyc-park.webp`

## Configure API Integration

Edit `APP_CONFIG` in `app.js`:

- `apiBaseUrl`: API Gateway invoke URL (leave empty for static mode)
- `apiKey`: API key if required
- `searchPath`: usually `/search`
- `uploadPath`: assignment PDF says `/photos`; older swagger uses `/upload`
- `s3PhotosBaseUrl`: optional S3 bucket URL to resolve keys returned by search

## Required Upload Files (frontend S3 bucket)

Upload all repo files, including the `assets/` folder.

## Run Locally

Open `index.html` in a browser.

## Important Assignment Behavior

- Custom labels are sent as a comma-separated value in header:
  - `x-amz-meta-customLabels: Sam, Sally`
- In static mode (no `apiBaseUrl`), search/upload are simulated in-browser.
- In API mode, frontend calls your deployed API Gateway endpoints.
