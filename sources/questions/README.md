# Original question image contract

This directory is the canonical home of each question's answer metadata, Git-tracked unredacted PNG, and flattened redacted derivative. The application imports only `redacted.webp`; the Vite build must never copy `original.png` into `dist/`.

Use one directory per opaque question ID:

```text
sources/questions/q-7m4k2d9xrp6v/
  original.png
  question.json
  redacted.webp
```

Question IDs use `q-` followed by 12 random lowercase Crockford Base32 characters. They must not encode or be derived from the match, date, event, teams, answer, source filename, image hash, timestamp, or insertion order. Generate an ID once, confirm that it is unique, and never rename it.

`question.json` owns the exact answer without repeating facts owned by the repository layout. The directory name is the question ID. A question becomes playable when `redacted.webp` exists beside the manifest. There is no lifecycle field or duplicate public copy. A ready question must have a valid manifest with source attribution and structured rights-review evidence; invalid ready questions fail synchronization. Do not store secrets or private legal documents in this public, tracked manifest.

Every manifest must set `pool` to `classic` or `deep-cut`. Use `classic` for an iconic match that belongs in the game's core historical canon. Use `deep-cut` for a less-famous question that rewards more specialized knowledge. Pool membership is authored because it is an editorial judgment rather than a fact that can be derived safely from the match metadata.

```json
{
  "rights": {
    "reviewedAt": "2026-08-11",
    "evidence": "Public permission URL or repository-visible review reference"
  }
}
```

Run `npm run questions:sync` after any manifest or redacted-image change. The generator derives the question ID, fills safe presentation and catalog choice defaults when omitted, and writes only client-safe runtime fields to `src/data/questions.generated.ts`; rights-review evidence is deliberately omitted. Stable catalog edition IDs and their allowed choice scope are emitted for cascading selectors, but Liquipedia revision provenance remains owned by the checked-in catalog. The generated module is not edited by hand.

When `catalogEditionId` is present, the answer stores `stage`, `blueTeamId`, `redTeamId`, and `gameNumber`; the generator derives year, tournament, historical team names, stages, and participant choices from that edition. If `choices` is omitted, the generator uses the catalog's years and series plus games 1 through at least 5. An explicit catalog-backed choice scope must omit `choices.stages` and `choices.teams`. The catalog has no stable stage or round ID, so `stage` remains the exact catalog label.

```json
{
  "catalogEditionId": "worlds-2024",
  "answer": {
    "stage": "Quarterfinal",
    "blueTeamId": "hanwha-life-esports",
    "redTeamId": "bilibili-gaming",
    "gameNumber": 4
  }
}
```

A non-catalog question remains self-contained: its answer also supplies `year` and `tournament`, and `choices.stages` plus `choices.teams` are required. Each static team choice is an `{ "id", "name" }` object so scoring still uses identity rather than display text. Every canonical question requires `original.png`; synthetic fixtures belong under test-only paths instead of sharing this manifest workflow.

Write the flattened derivative here as `redacted.webp` only after the manifest has source attribution and rights-review evidence. Its presence is the publication action. The sync check rejects incomplete ready questions, and Vite bundles only this derivative. Never use `original.png` as the playable image.

These originals are excluded from the site artifact, but they are not private. If the repository is public, every tracked original is available from the Git host and its history. Add a source only after confirming rights, attribution, and publication permission.
