# Question image contract

Only publish already-redacted question images in this directory.

- Remove player names, team names, logos, series scores, watermarks, and other direct identifiers in an offline preprocessing step.
- Flatten the redaction into the exported image. A CSS overlay is removable and does not count as redaction.
- Prefer WebP for production questions and keep the tracked original at `sources/questions/<question-id>/original.png`.
- Name the public derivative `<question-id>.webp` using the same opaque ID as its source directory and `question.json` manifest.
- Do not set a manifest to `published` until its flattened public derivative exists here.
- Record source and rights-review information in the question metadata before public release.
