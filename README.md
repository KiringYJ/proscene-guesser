# ProScene Guesser

Identify a competitive League match from one redacted broadcast frame. Each round asks for four scored signals:

1. year;
2. tournament and stage;
3. blue-side and red-side teams; and
4. game number.

This repository is bootstrapped as a static, client-only MVP. It currently ships one synthetic fixture so the complete play, score, replay, and share loop can be exercised without committing a third-party broadcast screenshot.

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
public/
  questions/        Pre-redacted public question images only
.github/workflows/  GitHub Pages deployment
```

Question answers are bundled into the browser. That is acceptable for a casual MVP, but it is not an anti-cheat design. A competitive daily challenge or trusted leaderboard would require server-side answer validation.

## Adding a question

1. Redact the source image offline and export a flattened WebP.
2. Keep the original, unredacted image outside this repository.
3. Add the public derivative under `public/questions/`.
4. Add a typed record to `src/data/questions.ts` with answer choices, the exact answer, alt text, and source information when appropriate.
5. Run `npm run check` and manually play the round at narrow and wide viewport sizes.

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
