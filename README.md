# ProScene Guesser

Identify a competitive League match from one redacted broadcast frame. Each round asks for four scored signals:

1. year;
2. tournament and stage;
3. blue-side and red-side teams; and
4. game number.

This repository is bootstrapped as a static, client-only MVP. A validated question enters the browser catalog as soon as its flattened `redacted.webp` exists beside the manifest.

## Playing

The Home screen offers two solo modes:

- **Quick Play** starts immediately with 5 unique random questions and a 90-second timer for each round.
- **Custom Game** lets you choose 5, 10, or All rounds and a timer setting of 60 seconds, 90 seconds, 2 minutes, or No limit. The defaults are 5 rounds and 90 seconds.

Solo games start without a room or lobby. Questions do not repeat within a game. If fewer questions are available than requested, the game uses every available question and shows the actual round count rather than promising unavailable rounds.

Each round shows one redacted frame and, when enabled, a countdown. Fill in the four scored answers and submit to lock them. If time expires first, the current partial answer is locked. The reveal shows the correct answer and the round score out of 4 before continuing.

A finite game ends with the total score, a per-round breakdown, and actions to play again, change settings, or share the final result. Multiplayer remains unimplemented; its proposed product flow and authority boundaries are documented in [Future multiplayer design](docs/multiplayer-architecture.md).

## Stack

- Vue 3 and TypeScript
- Vite
- Vuetify 4
- Vitest, Vue TypeScript checking, ESLint, and Oxlint
- uv-managed yt-dlp media authoring tools with system FFmpeg
- GitHub Pages through GitHub Actions

There is intentionally no router, account system, backend, or leaderboard in the current architecture.

## Local development

Use Node `24.16.0` (recorded in `.node-version`) or another version allowed by `package.json`.

```powershell
npm install
npm run dev
```

Ordinary development and production builds use the same generated playable-question catalog.
`npm run dev` regenerates that catalog before Vite starts, so any question directory with a valid
manifest and `redacted.webp` appears without a separate publication command.

Run the full local verification suite with:

```powershell
npm run check
```

The production build is written to `dist/`.

## Media authoring

The browser application does not require Python. Maintainers can use the separate uv environment to acquire a source broadcast with yt-dlp and cut candidate frames with FFmpeg.

From the repository root, create the locked environment and verify both tools:

```powershell
uv sync --locked
uv run yt-dlp --version
ffmpeg -version
ffprobe -version
```

FFmpeg and FFprobe must be real executables on `PATH`; do not install the unrelated Python package named `ffmpeg`. yt-dlp discovers the executables automatically. The checked-in `yt-dlp.conf` enables the repository's Node runtime for YouTube support, refuses playlist expansion, and writes downloads plus metadata under the ignored `.media/` directory.

Start a resumable frame-selection capture with a YouTube video URL and a rough timestamp:

```powershell
npm run -- media:pick-frame -- --url "<youtube-url>" --timestamp "01:23:45"
```

Use a stable URL containing the video ID, such as a watch URL, `youtu.be` URL, or `/live/<video-id>` URL. A channel-level `/@channel/live` link is intentionally rejected because it can identify a different stream later.

The command downloads the ten-second interval centered on the rough timestamp, using yt-dlp's from-start mode when the URL is still live, generates twenty coarse candidates at 2 fps, and opens a numbered local gallery. After the coarse choice, it generates every decoded frame within plus or minus 0.5 seconds and opens a second gallery for the final choice. The resulting lossless PNG and its capture sidecar are written to `incoming/`.

Each choice is written atomically to the sidecar immediately. Running the same canonical video URL and rough timestamp resumes the unfinished stage; interrupted galleries are regenerated deterministically from the recorded source clip. After completion, the command verifies and returns the recorded final PNG without asking again. A per-capture lock prevents two invocations from racing. A non-interactive caller can provide either choice explicitly:

```powershell
npm run -- media:pick-frame -- --url "<youtube-url>" --timestamp "01:23:45" --coarse 8
npm run -- media:pick-frame -- --url "<youtube-url>" --timestamp "01:23:45" --final 27
```

The capture manifest records the canonical URL, clip boundaries and SHA-256, selected decoded-frame indexes and timestamps, exact yt-dlp/FFmpeg commands, tool versions and binary hashes, the selected gallery PNG hash, and the final PNG SHA-256. The picker verifies that the selected gallery image and deterministic final extraction have identical hashes. Temporary clips and galleries remain under ignored `.media/frame-selections/`; do not delete an unfinished capture if it still needs either choice.

The underlying yt-dlp command remains available for exceptional manual acquisition:

```powershell
uv run yt-dlp "<source-url>"
```

During question migration, move the selected PNG to `sources/questions/<question-directory>/original.png` and its sidecar to `sources/questions/<question-directory>/capture.json`. The capture record is provenance only; source attribution and rights-review evidence are still required before the question becomes playable.

## Project layout

```text
src/
  components/       Question, answer, and result panels
  composables/      Vue adapter for the active game session
  data/             Static local question catalog
  game/             Public game contracts, pure rules, and adapters
  lib/              Score presentation and share-result formatting
  plugins/          Vuetify configuration
  types/            Question and score contracts
docs/               Architecture and content-workflow decisions
sources/
  questions/        Canonical manifests, originals, and flattened redactions
pyproject.toml       uv-managed media-authoring dependencies
yt-dlp.conf          Repository-local download defaults
.github/workflows/  GitHub Pages deployment
```

Question answers are bundled into the browser. That is acceptable for a casual MVP, but it is not an anti-cheat design. A competitive daily challenge or trusted leaderboard would require server-side answer validation.

The solo experience remains a static browser game. Question answers are therefore inspectable in the built assets, and local scoring is appropriate only for casual play. A future synchronized room mode requires an authoritative backend; see [Future multiplayer design](docs/multiplayer-architecture.md). That document describes a proposed design only. Multiplayer is not implemented.

## Question directories and IDs

Runtime question IDs remain intentionally opaque. Use `q-` followed by 12 random lowercase Crockford Base32 characters, matching `^q-[0-9a-hj-km-np-tv-z]{12}$`.

Generate an ID with Node.js:

```powershell
node -e "const {randomBytes}=require('node:crypto'); const a='0123456789abcdefghjkmnpqrstvwxyz'; console.log('q-'+[...randomBytes(12)].map(b=>a[b&31]).join(''))"
```

Generate each ID once, confirm that it is unused, and keep it unchanged. Do not derive the opaque ID from dates, events, teams, answers, source filenames, image hashes, timestamps, or insertion order.

Question directories add a readable locator before the opaque token:

```text
<event>--<stage>--<blue-team>--<red-team>--g<game>--<id-token>
```

For example, runtime ID `q-efd3q8g07jxb` lives at:

```text
sources/questions/worlds-2024--semifinal--gen-g-esports--t1--g4--efd3q8g07jxb/
```

For catalog-backed questions, the event field comes from `catalogEditionId`. For a non-catalog question, it is the slug of `<tournament>-<year>`. The stage and team fields are lowercase kebab-case slugs of their canonical manifest values; blue side always precedes red side. The final directory field is the runtime ID with its `q-` prefix omitted.

The semantic locator is derived and may be renamed when answer metadata is corrected. The opaque runtime ID is the stable identity and must not change. Two screenshots with otherwise identical match metadata remain distinct through their final ID tokens. `npm run questions:sync` rejects a directory whose locator does not match its `question.json`.

## Question data

Each question's canonical answer and authoring metadata live beside its source image in `sources/questions/<question-directory>/question.json`. The directory's final token owns the stable runtime ID; the manifest does not repeat it. The presence of `redacted.webp` is the only readiness signal: there is no lifecycle field and no second public-image copy. `npm run questions:sync` validates every manifest and semantic directory name, materializes safe presentation and catalog-backed choice defaults, and generates `src/data/questions.generated.ts` from questions that have a redacted derivative; do not edit that generated module by hand. An invalid ready question fails synchronization instead of silently becoming another status. Rights-review evidence is deliberately omitted from the client catalog. Stable edition and team IDs are retained for cascading choices and scoring, while historical display names come from the catalog.

Internal curation metadata is validated during authoring and omitted from the generated browser catalog.

For a catalog-backed question, `catalogEditionId` determines the year and tournament, and the answer records only the stage, side-specific team IDs, and game number. Selecting a year limits the tournament selector to editions from that year. Selecting an edition then limits stage and team choices to that edition, and changing either upstream value clears stale downstream selections. Year and event score independently: choosing the same tournament and stage for another year still earns the event point. When one series has multiple editions in the same year, such as Rift Rivals, the form displays the full edition name and uses its stable tournament identity to keep regional variants distinct. Stage and participant lists come from the edition catalog rather than being duplicated in each question manifest.

The runtime adapter in `src/data/questions.ts` turns generated prompt/disclosure bundles into Vite-aware local bundles. A literal Vite glob imports only `sources/questions/*/redacted.webp`, so flattened derivatives enter the build while `original.png` files do not. Components receive only the public prompt before reveal. Because this remains a static client, the local session still loads the disclosure and answers for playable questions remain inspectable in the built JavaScript.

## Adding a question

1. Generate a new opaque runtime question ID.
2. Build the semantic directory name from the answer fields and append the ID token without `q-`.
3. Create `sources/questions/<question-directory>/question.json`, complete its internal curation metadata, and record the exact answer. Do not repeat the ID or lifecycle state inside the manifest.
4. Add the original PNG beside it as `original.png` so it is tracked by Git without entering the Vite build.
5. Complete source attribution and structured rights-review evidence in `question.json`. Presentation and choice scopes may be supplied explicitly; safe defaults are derived for catalog-backed questions when omitted.
6. Redact the source image offline and write the flattened derivative to `sources/questions/<question-directory>/redacted.webp`. Its presence makes the question playable.
7. Run `npm run questions:sync` to validate every ready question and regenerate the client catalog.
8. Run `npm run check` and manually play the round at narrow and wide viewport sizes.

Vite includes only referenced `redacted.webp` derivatives in `dist/`; it does not copy `original.png` or `redaction.json`. The complete `sources/` tree is still part of Git history, so originals are downloadable from the Git host whenever the repository is public. Confirm source rights and publication permission before adding an original.

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
