# Original question image contract

This directory is the canonical home of each question's answer metadata and Git-tracked, unredacted PNG. Files here are source material: the application must not import them directly, and the Vite build must not copy originals into `dist/`.

Use one directory per opaque question ID:

```text
sources/questions/q-7m4k2d9xrp6v/
  original.png
  question.json
```

Question IDs use `q-` followed by 12 random lowercase Crockford Base32 characters. They must not encode or be derived from the match, date, event, teams, answer, source filename, image hash, timestamp, or insertion order. Generate an ID once, confirm that it is unique, and never rename it.

`question.json` owns the exact answer. A `draft` manifest may omit public presentation fields and choices; it is validated but excluded from the client catalog. A `published` manifest must supply its public filename, presentation text, choices, and—when it is a production question—source attribution. Run `npm run questions:sync` after any manifest change; the generated `src/data/questions.generated.ts` file is not edited by hand.

When `catalogEditionId` is present, validation cross-checks the answer's year, tournament, and teams against the checked-in international catalog. Synthetic fixtures are the only manifests allowed to omit `original.png`.

The corresponding publishable derivative belongs at `public/questions/<question-id>.webp`. Never publish `original.png` as the playable image.

These originals are excluded from the site artifact, but they are not private. If the repository is public, every tracked original is available from the Git host and its history. Add a source only after confirming rights, attribution, and publication permission.
