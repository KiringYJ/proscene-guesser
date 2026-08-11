# Question image contract

Only publish already-redacted question images in this directory.

- Remove player names, team names, logos, series scores, watermarks, and other direct identifiers in an offline preprocessing step.
- Flatten the redaction into the exported image. A CSS overlay is removable and does not count as redaction.
- Use WebP and keep the tracked original at `sources/questions/<question-id>/original.png`.
- Name the public derivative `<question-id>.webp` using the opaque ID owned by its source directory.
- Treat adding the derivative here as the publication action. The catalog sync fails unless the corresponding manifest is complete and attributable.
- Record source and rights-review information in the question metadata before public release.
