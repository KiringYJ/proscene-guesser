# Project-Specific Agent Context

## Architecture

ProScene Guesser is a static, client-only Vue 3 application. Vite builds the site, Vuetify 4 supplies UI primitives, and GitHub Pages serves the `dist/` artifact under `/proscene-guesser/`.

The first architecture deliberately has no router, account system, backend, leaderboard, or trusted anti-cheat path. Question answers are compiled into the client.

## Build Commands

- Install: `npm install`
- Development server: `npm run dev`
- Production build: `npm run build`
- Local production preview: `npm run preview`

Use the Node version in `.node-version` or another version allowed by `package.json`.

## Test Commands

- Full verification: `npm run check`
- Unit tests: `npm test`
- Type check: `npm run type-check`
- Linters: `npm run lint`

For UI changes, also play a complete round at desktop width and at a narrow mobile viewport. Confirm there is no horizontal overflow and inspect browser console warnings/errors.

## Important Files and Directories

- `src/App.vue`: round orchestration and session state.
- `src/components/`: screenshot, answer, and result panels.
- `src/data/questions.ts`: runtime adapter for the generated question catalog.
- `src/data/questions.generated.ts`: generated published-question records; never edit by hand.
- `src/lib/scoring.ts`: four-dimension scoring contract.
- `src/types/question.ts`: question, player-answer, and result types.
- `sources/questions/`: canonical semantic question directories containing JSON manifests and Git-tracked original PNGs.
- `public/questions/`: public, already-redacted question derivatives only.
- `.github/workflows/deploy-pages.yml`: verified build and GitHub Pages deployment.

## Domain Terms

- **Question / archive**: one redacted broadcast frame plus answer metadata.
- **Event**: tournament and stage together; they score as one dimension.
- **Teams**: blue-side and red-side teams together; they score as one dimension.
- **Flattened redaction**: identifiers are removed in the exported image itself, not covered with removable CSS.
- **Original question image**: the tracked, unredacted PNG at `sources/questions/<question-directory>/original.png`; it is repository-visible but excluded from `dist/`.
- **Question manifest**: the canonical `question.json` beside an original; it stores the exact answer and controls draft versus published status.
- **Question ID**: an opaque `q-` plus 12 random lowercase Crockford Base32 characters that carries no match, date, source, answer, or ordering information.
- **Question directory**: `<event>--<stage>--<blue-team>--<red-team>--g<game>--<id-token>`, where the semantic fields are derived from the manifest and the final token is the stable question ID without `q-`.
- **Synthetic fixture**: a non-production asset used to exercise the UI without a third-party screenshot.

## Workspace Configuration

Shared agent and editor configuration is project-wide repository content. Track the agent-workbench config, provenance ledger, canonical guides, portable prompts and skills, and vendor discovery files directly on `main` so a normal clone receives the complete workspace. Keep only personal settings, secrets, caches, and local runtime state untracked.

## Project-Specific Constraints

- Keep each unredacted source PNG at `sources/questions/<question-directory>/original.png`; never import it into the application or copy it into the Vite build.
- Store the canonical answer in the adjacent `question.json`; validate and regenerate with `npm run questions:sync`.
- Never edit `src/data/questions.generated.ts` by hand or publish a draft manifest.
- Require structured source attribution and rights approval before publishing a production manifest; never emit rights-review evidence into the client catalog.
- Keep draft derivatives under `sources/questions/<question-directory>/redacted.webp`; reject any public question image not referenced by a published manifest.
- Use an opaque random runtime question ID matching `^q-[0-9a-hj-km-np-tv-z]{12}$`; never derive it from content, metadata, hashes, timestamps, or order. Store its token without `q-` at the end of the semantic directory name and never change it.
- Derive each directory locator from canonical manifest values and rename the semantic prefix when those values change. Require `<event>--<stage>--<blue-team>--<red-team>--g<game>--<id-token>` and reject stale or malformed locators during catalog synchronization.
- Add only flattened, already-redacted public derivatives under `public/questions/`.
- Treat tracked originals as public whenever the Git repository is public.
- Treat source rights, attribution, and publication permission as evidence requirements for every production question.
- Do not describe the static client as cheat-resistant; answers are inspectable in browser assets.
- Preserve the four-point scoring contract unless a product decision and tests intentionally change it.
- Keep the production Vite base aligned with the GitHub repository slug.
