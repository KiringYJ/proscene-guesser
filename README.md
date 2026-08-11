# ProScene Guesser

Identify a competitive League match from one redacted broadcast frame. Each round asks for four scored signals:

1. year;
2. tournament and stage;
3. blue-side and red-side teams; and
4. game number.

This repository is bootstrapped as a static, client-only MVP. Production source frames remain unpublished drafts until a flattened redaction and the required release checks are complete; the browser catalog may therefore be empty during question preparation.

## Stack

- Vue 3 and TypeScript
- Vite
- Vuetify 4
- Vitest, Vue TypeScript checking, ESLint, and Oxlint
- GitHub Pages through GitHub Actions

There is intentionally no router, account system, backend, or leaderboard in the first architecture.

## Local development

Use Node `24.16.0` (recorded in `.node-version`) or another version allowed by `package.json`.

```powershell
npm install
npm run dev
```

Run the full local verification suite with:

```powershell
npm run check
```

The production build is written to `dist/`.

## Project layout

```text
src/
  components/       Question, answer, and result panels
  data/             Static question catalog
  lib/              Scoring and share-result rules
  plugins/          Vuetify configuration
  types/            Question and score contracts
sources/
  questions/        Canonical question JSON and tracked original PNGs
public/
  questions/        Pre-redacted public question images only
.github/workflows/  GitHub Pages deployment
```

Question answers are bundled into the browser. That is acceptable for a casual MVP, but it is not an anti-cheat design. A competitive daily challenge or trusted leaderboard would require server-side answer validation.

## Question IDs

Question IDs are intentionally opaque. Use `q-` followed by 12 random lowercase Crockford Base32 characters, matching `^q-[0-9a-hj-km-np-tv-z]{12}$`.

Generate an ID with Node.js:

```powershell
node -e "const {randomBytes}=require('node:crypto'); const a='0123456789abcdefghjkmnpqrstvwxyz'; console.log('q-'+[...randomBytes(12)].map(b=>a[b&31]).join(''))"
```

Generate each ID once, confirm that it is unused, and keep it unchanged. Do not derive IDs from dates, events, teams, answers, source filenames, image hashes, timestamps, or insertion order.

## Question data

Each question's canonical answer and lifecycle metadata live beside its source image in `sources/questions/<question-id>/question.json`. Draft manifests are retained in Git but omitted from the browser bundle. `npm run questions:sync` validates every manifest, resolves catalog-backed choices, and generates `src/data/questions.generated.ts` from only the client-safe fields of published records; do not edit that generated module by hand. Authoring fields such as draft status are never copied into the client catalog. Stable edition IDs and the permitted edition scope are included because the answer form uses them for cascading choices.

For a catalog-backed question, selecting a year limits the tournament selector to editions from that year. Selecting an edition then limits stage and team choices to that edition, and changing either upstream value clears stale downstream selections. When one series has multiple editions in the same year, such as Rift Rivals, the form displays the full edition name and scores its stable edition ID. Stage and participant lists come from the edition catalog rather than being duplicated in each question manifest.

The runtime adapter in `src/data/questions.ts` turns the generated records into Vite-aware image URLs. Because this remains a static client, answers for published questions are still inspectable in the built JavaScript.

## Adding a question

1. Generate a new opaque question ID.
2. Create `sources/questions/<question-id>/question.json` with `status` set to `draft` and record the exact answer.
3. Add the original PNG beside it as `original.png` so it is tracked by Git without entering the Vite build.
4. Redact the source image offline and export a flattened WebP to `public/questions/<question-id>.webp`.
5. Complete the presentation fields, answer choices, and source attribution in `question.json`, then change its status to `published`.
6. Run `npm run questions:sync` to validate the manifests and regenerate the client catalog.
7. Run `npm run check` and manually play the round at narrow and wide viewport sizes.

The `sources/` directory is not copied into `dist/` or deployed by Vite. It is still part of the Git history, so originals are downloadable from the Git host whenever the repository is public. Confirm source rights and publication permission before adding an original.

The scorer intentionally awards four points. Tournament plus stage form one event point, and both side-specific team selections form one teams point.

## GitHub Pages

The production Vite base is `/proscene-guesser/`, matching the expected project-page URL:

```text
https://kiringyj.github.io/proscene-guesser/
```

After the product branch is pushed, select **GitHub Actions** as the Pages source in the repository settings. The included workflow installs from `package-lock.json`, runs the complete verification suite, builds `dist/`, and deploys the artifact on pushes to `main`.

## Workspace configuration

Product files live on `main`. Reproducible agent/editor instructions live on the separate orphan `workspace-config` branch and are restored locally through `.git/info/exclude`; that branch must never be merged into a product branch.

## Content and affiliation

Before publishing real questions, review the rights and attribution requirements for every broadcast source. The existence of other fan projects is not evidence that a particular screenshot use is authorized.

ProScene Guesser is an unofficial fan project and is not affiliated with Riot Games or tournament broadcasters.
