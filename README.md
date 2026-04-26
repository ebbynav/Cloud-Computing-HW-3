# AI Photo Search Frontend

This repository contains only the frontend application for the AI Photo Search project.

## Frontend Repo Structure

- `index.html`
- `app.js`
- `styles.css`
- `assets/`
- `buildspec-frontend.yml`
- `README.md`

## Build and Deploy (CodeBuild)

The `buildspec-frontend.yml` deploys frontend assets to S3 bucket `cc-hw3-bucket1`.

It performs:

- `aws s3 sync` for repo files (excluding buildspec files, `.git`, and `README.md`)
- explicit content-type upload for:
  - `index.html`
  - `app.js`
  - `styles.css`

## App Configuration

Set frontend API values in `app.js` under `APP_CONFIG`:

- `apiBaseUrl`
- `apiKey`
- `searchPath`
- `uploadPath`
- `s3PhotosBaseUrl`

## Notes

- Backend Lambda functions, backend buildspec files, and CloudFormation stack should live in a separate backend repository.
