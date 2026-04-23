# Cloud Computing HW-3 (Assignment 3 Frontend)

Frontend for AI Photo Search with:
- natural-language search UI (`GET /search`)
- photo upload UI with custom labels header (`PUT /photos` by default)
- static fallback mode for local preview/testing
- starter CloudFormation stack (`template.yaml`) for the assignment infrastructure

## Repository Contents

- `index.html`
- `styles.css`
- `app.js`
- `backend/`
- `template.yaml`
- `assets/`

## Configure API Integration

Edit `APP_CONFIG` in `app.js`:

- `apiBaseUrl`: API Gateway invoke URL (leave empty for static mode)
- `apiKey`: API key if required
- `searchPath`: `/search`
- `uploadPath`: `/photos` by default; `/upload` is also supported for the older Swagger contract
- `s3PhotosBaseUrl`: optional S3 bucket URL to resolve keys returned by search
- The upload request sends custom labels using the `x-amz-meta-customLabels` metadata header.
- `template.yaml` outputs the frontend website URL and API invoke URL for deployment wiring.
- The API stage defaults to `v1` so it lines up with the Swagger base path.
- `backend/` contains the Lambda source for indexing and search.

## Required Upload Files (frontend S3 bucket)

Upload all repo files, including the `assets/` folder and `template.yaml`.

## Run Locally

Open `index.html` in a browser.

## Important Assignment Behavior

- Custom labels are sent as a comma-separated value in header:
  - `x-amz-meta-customLabels: Sam, Sally`
- In static mode (no `apiBaseUrl`), search/upload are simulated in-browser.
- In API mode, frontend calls your deployed API Gateway endpoints.

## Photo Selection Guidelines

Choose photos that are:

- visually obvious
- easy for Rekognition to identify
- different from each other
- useful for testing search

### Best Categories

1. Animals

Examples:

- dog in park
- cat on bed
- bird on tree

Good search terms:

- dog
- cat
- bird
- park
- grass

2. People

Examples:

- one person portrait
- two friends outdoors
- family picture

Good for:

- person
- people
- face

And custom labels like:

- Sam
- Sally
- Abhinav

3. Outdoor scenes

Examples:

- beach
- sunset
- mountain
- lake
- city street

Good search terms:

- beach
- sunset
- road
- sky

4. Everyday objects

Examples:

- laptop on desk
- phone
- bottle
- car
- bicycle

Good search terms:

- laptop
- desk
- car
- bike

5. Food

Examples:

- pizza
- coffee
- burger

Good search terms:

- pizza
- coffee
- food

Use royalty-free images from places like:

- Unsplash
- Pexels
- Pixabay

All images should be in `.jpg` format.

Avoid:

- abstract art
- screenshots
- memes
- very dark photos
- cluttered collages
- tiny low-resolution images
