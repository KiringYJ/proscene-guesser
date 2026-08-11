# Original question image contract

This directory is the canonical home of each question's answer metadata and Git-tracked, unredacted PNG. Files here are source material: the application must not import them directly, and the Vite build must not copy originals into `dist/`.

Use one directory per opaque question ID:

```text
sources/questions/q-7m4k2d9xrp6v/
  original.png
  question.json
```

Question IDs use `q-` followed by 12 random lowercase Crockford Base32 characters. They must not encode or be derived from the match, date, event, teams, answer, source filename, image hash, timestamp, or insertion order. Generate an ID once, confirm that it is unique, and never rename it.

`question.json` owns the exact answer without repeating facts owned by the repository layout. The directory name is the question ID. A manifest is a draft while `public/questions/<question-id>.webp` is absent; adding that exact file makes it a publication candidate. Publication candidates must supply presentation text, choices, and source attribution. Run `npm run questions:sync` after any manifest or public-image change; the generated `src/data/questions.generated.ts` file is not edited by hand.

Every manifest must set `pool` to `classic` or `deep-cut`. Use `classic` for an iconic match that belongs in the game's core historical canon. Use `deep-cut` for a less-famous question that rewards more specialized knowledge. Pool membership is authored because it is an editorial judgment rather than a fact that can be derived safely from the match metadata.

When `catalogEditionId` is present, validation cross-checks the answer's year, tournament, and teams against the checked-in international catalog. Every canonical question is production data and requires `original.png`; synthetic fixtures belong under test-only paths instead of sharing this manifest workflow.

The corresponding publishable derivative belongs at `public/questions/<question-id>.webp`. Its presence is the publication signal, so the sync rejects incomplete publication metadata, unsupported filenames, and images without a matching source directory. Never publish `original.png` as the playable image.

These originals are excluded from the site artifact, but they are not private. If the repository is public, every tracked original is available from the Git host and its history. Add a source only after confirming rights, attribution, and publication permission.
