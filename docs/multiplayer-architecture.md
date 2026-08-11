# Multiplayer-ready architecture

## Status and scope

ProScene Guesser is still a static, single-player application. It has no rooms, accounts, realtime transport, backend, shared timer, or leaderboard today.

The current architecture establishes the smallest useful migration seam for a future synchronous room mode:

- the UI renders a public question prompt and sends answer intent through an asynchronous session port;
- a local in-memory session owns round order, submission state, scoring, reveal, and session statistics;
- canonical solutions and source attribution are kept out of the pre-reveal prompt shape;
- scoring correctness is a pure rule that can later run in an authoritative service; and
- room protocol, persistence, provider selection, and multiplayer screens remain deferred until multiplayer is prioritized.

This is migration preparation, not an anti-cheat guarantee. The static build still contains local solutions and remains suitable only for casual play.

## Current dependency direction

```text
Vue UI
  -> ActiveGameSessionPort
      -> LocalActiveGameSession
          -> local prompt/disclosure bundles
          -> pure scoring rules
```

`QuestionPrompt` contains only information that may be shown while answering: the image, clue, choices, pool, and stable question ID. `RevealDisclosure` contains the canonical solution and optional source attribution. The local catalog combines them in a `LocalQuestionBundle`, but only the session adapter may consume that bundle. Answer and screenshot components receive `QuestionPrompt`, never the bundle.

The generated static catalog follows the same split:

```text
authoring manifest
  -> GeneratedLocalQuestionBundle
      prompt(question ID, choices, public metadata)
      disclosure(solution, source)
  -> runtime LocalQuestionBundle
      prompt(Vite-bundled redacted image URL, choices, public metadata)
      disclosure(solution, source)
```

The ESLint boundary prevents UI and public game modules from importing the local catalog or authority/local adapter directories. The production build check also proves that the synthetic development round is absent from `dist/`.

## Current active-game contract

The UI-facing `ActiveGameSessionPort` is intentionally narrower than a future room API. It exposes a read-only snapshot subscription plus two asynchronous commands:

- `submitAnswer(answer)`
- `advanceRound()`

Snapshots are one of:

- `empty`: no playable question is available;
- `answering`: public prompt, round progress, and submission state; or
- `revealed`: public prompt, reveal disclosure, score result, progress, and advance state.

Valid commands publish a `pending` snapshot before completing. Invalid, out-of-phase, or reentrant commands return a typed rejection without overwriting the current snapshot. A one-question replay receives a new `roundId`, so the Vue adapter can reset its editable draft only when authoritative round identity changes.

A future remote adapter may implement the same active-game port. Room creation, joining, host controls, transport messages, and reconnect behavior belong to separate room-level contracts rather than being forced into this local interface.

## Future room flow

The intended first multiplayer experience is:

1. one player creates a room;
2. other players join with a room code;
3. the host starts the game;
4. every frozen-roster player receives the same public question and server deadline;
5. each player submits at most one accepted answer for that round;
6. the server reveals when everyone has answered or the deadline has passed;
7. every player receives the round result and cumulative standings; and
8. the host advances to the next round until the game is finished.

The server-owned room state should be a discriminated state machine:

```text
lobby -> answering -> revealed -> answering -> ... -> finished
```

- `lobby` contains the host and participants. Joining is allowed only here in the first version.
- `answering` contains a stable `roundId`, public prompt, frozen roster, server time, deadline, and submission statuses. It contains no solution or trusted score.
- `revealed` contains the disclosed solution, per-player round results, cumulative standings, and whether the authenticated host may advance.
- `finished` contains final standings and expiry metadata.

## Authority and anti-cheat boundary

The future server, not the browser, must own and validate:

- room membership and host role;
- question selection and canonical solutions;
- current phase, round identity, roster, and deadline;
- accepted submissions and duplicate detection;
- scoring, reveal, totals, and ranking; and
- room expiry and reconnect state.

Clients send intent, such as `start`, `submit answer`, or `advance`; they never send trusted points, correctness flags, ranks, host flags, or timestamps. Every command is authenticated, authorized for its room and phase, schema-validated, size-limited, and rate-limited.

The short room code is an invitation and discovery handle, not a credential. Joining must establish a separate server-side player identity with a scoped, expiring credential. Host authority is stored and checked server-side on every host command.

Competitive prompts and solutions must be deployed through a private authority-side content path. Moving scoring to a server while shipping the solution in public Git or frontend JavaScript would not protect it.

Server authority can prevent forged scores, invalid transitions, duplicate submissions, normal-API early reveal, and many replay/race attacks. It cannot prove that a person did not search externally, collaborate out of band, use another device, or automate recognition. Describe these controls as integrity and abuse resistance, not proof of honest play.

## Timing, ordering, and concurrency

- The server clock and persisted `deadlineAt` decide whether an answer is on time. A client countdown is display-only.
- Starting freezes the round roster. A disconnected player remains in that roster and may reconnect; otherwise the deadline still ends the round.
- Each round has a durable, retry-safe deadline alarm. The final accepted answer and the deadline alarm converge on one atomic reveal transition.
- Accepted answers have a uniqueness rule such as `(roomId, roundId, playerId)`. Retried commands use actor-scoped idempotency keys.
- `snapshotSequence` orders observations and reconnect resynchronization. It does not invalidate an otherwise valid concurrent answer.
- `roundId` and a phase epoch establish command validity. Compare-and-swap is required for serialized host transitions such as start and advance, not for ordinary player submissions.
- The first version should not transfer host authority automatically. A disconnected host may reconnect with the same credential; otherwise a revealed room expires under its inactivity policy.

## Backend capability checklist

Do not choose a provider merely because it supports WebSockets or a serverless function. The multiplayer backend needs:

- atomic or serialized mutation per room;
- durable state with room TTL and reconnect support;
- durable scheduled alarms with retry for round deadlines;
- realtime fanout plus snapshot resynchronization;
- private secret/content storage;
- authentication and per-command authorization;
- idempotency, uniqueness constraints, validation, and rate limiting;
- origin/security controls appropriate to the chosen transport; and
- structured, credential-safe observability for joins, commands, duplicates, deadlines, disconnects, and transitions.

## Migration sequence

### Phase 0 — implemented now

- Keep the product static and single-player.
- Separate prompt and reveal data.
- Keep scoring correctness pure.
- Drive the UI through `ActiveGameSessionPort` and an in-memory adapter.
- Test lifecycle, reentry, reveal, replay identity, prompt leakage, and production fixture exclusion.

### Phase 1 — authoritative room service

- Decide round duration, room capacity, answer mutability, ranking/tie policy, room TTL, and competitive content custody.
- Select infrastructure against the capability checklist above.
- Define a versioned room wire protocol separately from the UI-facing port.
- Implement the security baseline before exposing remote handlers.
- Add create, join, start, submit, reveal, advance, reconnect, and expiry behavior with race tests.
- Extract pure game code into a shared package only when both frontend and backend actually consume it.

### Phase 2 — multiplayer interface

- Add mode selection, create/join screens, lobby participants, and host controls.
- Render the server deadline and lock answers after server acknowledgment.
- Add synchronized reveal, per-round results, cumulative standings, and final results.
- Exercise full games in multiple browser contexts, including reconnects.

### Phase 3 — operational hardening

- Tune abuse controls and anomaly detection.
- Add adversarial replay, timeout-race, connection-churn, scheduler-failover, and load tests.
- Add moderation/support tooling only when real operational needs are known.

## Decisions intentionally deferred

The current code does not select a backend vendor, realtime protocol, authentication provider, room-code format, capacity, timer duration, submission-edit policy, ranking method, or host-transfer policy beyond the conservative first-version default described above. Those choices should be made together when an authoritative room service is funded and scoped.
