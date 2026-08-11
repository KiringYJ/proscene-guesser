# Screenshot inbox

Drop screenshots for new questions in this directory, then ask Codex to
"migrate the screenshots in `incoming` into questions."

Files placed here stay out of Git until they are migrated. During migration,
Codex will handle each screenshot as a separate question candidate:

1. Inspect the screenshot and verify the match metadata rather than guessing.
2. Generate a unique opaque question ID.
3. Move or losslessly convert the screenshot to
   `sources/questions/<question-id>/original.png`.
4. Create a validated draft `question.json` beside it, using a catalog edition
   ID when the match is covered by the checked-in catalog.
5. Run `npm run questions:sync` before removing the intake copy.

Migration creates incomplete, unredacted questions only. A question becomes playable later when
source attribution and rights-review evidence are recorded and a flattened `redacted.webp` is
created beside the manifest.

If a screenshot cannot be identified reliably, Codex will leave it here and
report the exact missing metadata instead of inventing an answer.
