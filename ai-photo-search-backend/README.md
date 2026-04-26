# Backend Source

This folder contains the Lambda source for the assignment:

- `index-photos.js` indexes S3 uploads into OpenSearch and merges Rekognition/custom labels.
- `search-photos.js` disambiguates search text and queries the `photos` index.
- `shared.js` holds small helpers used by both Lambdas.

Expected environment variables:

- `OPENSEARCH_ENDPOINT`
- `OPENSEARCH_INDEX` default: `photos`
- `OPENSEARCH_BASE_PATH` default: empty
- `LEX_BOT_ID`
- `LEX_BOT_ALIAS_ID`
- `LEX_LOCALE_ID` default: `en_US`
- `AWS_REGION`

If you deploy with CloudFormation/SAM, package these files into the Lambda zips or inline them into `template.yaml`.
