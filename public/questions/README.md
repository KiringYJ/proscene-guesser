# Question image contract

Only publish already-redacted question images in this directory.

- Remove player names, team names, logos, series scores, watermarks, and other direct identifiers in an offline preprocessing step.
- Flatten the redaction into the exported image. A CSS overlay is removable and does not count as redaction.
- Prefer WebP for production questions and keep originals outside this repository.
- Record source and rights-review information in the question metadata before public release.
- Treat `demo-redacted.svg` as a synthetic UI fixture, not a production question.
