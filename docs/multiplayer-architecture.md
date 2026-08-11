# Future multiplayer design

## Status

Multiplayer is not implemented. ProScene Guesser currently has no create-room or join-room screens, room codes, lobby, realtime transport, shared timer, multiplayer identity, or authoritative game server.

This document records a proposed product and service design for future implementation. It is not a description of current functionality, a committed backend choice, or an anti-cheat claim.

## Proposed player flow

The Home screen would add a Multiplayer path alongside the implemented solo modes:

```text
Home
└─ Multiplayer
   ├─ Create room
   └─ Join room
```

### Create room

The host would:

1. choose the round count and round timer;
2. create a room and receive a short invitation code;
3. wait in a lobby while players join;
4. review the participant list and selected settings; and
5. start the game when ready.

Only the authenticated host could change settings or start from the lobby. Starting would freeze both the settings and active roster for that game.

### Join room

A player would enter a room code, establish a room-scoped player identity, and enter the lobby. A room code would locate the room; it would not by itself grant host authority or act as a durable credential.

The first version should accept new players only while the room is in the lobby. Reconnecting players could resume their existing room identity subject to server-side expiry and authorization rules.

### Synchronized game

Each round would follow the solo answer-and-reveal shape while using server-owned state:

1. every player receives the same public question and deadline;
2. each player submits at most one answer for the round;
3. the server accepts or rejects the submission for the current room, player, round, and deadline;
4. the server reveals after every active player has answered or the deadline expires;
5. players see the correct answer, their score out of 4, and cumulative standings; and
6. the host advances after the synchronized reveal.

The server deadline would determine whether a submission is on time. Client countdowns would be display aids, not trusted clocks. A disconnected player would remain on the frozen roster and could reconnect; otherwise the deadline would still allow the room to progress.

### Final results and rematch

After the configured number of rounds, every player would see final standings and a per-round breakdown. The lobby host could propose a rematch that returns the group to a pre-game lobby, preserves the invited players who remain connected, and requires a new server-authorized start. Rematch settings and roster behavior should be confirmed during implementation rather than inferred from the previous game.

## Proposed room lifecycle

The authoritative room would use an explicit state machine:

```text
lobby -> answering -> revealed -> answering -> ... -> finished
   ^                                                   |
   └-------------------- rematch ----------------------┘
```

- `lobby`: participants may join, and the host may configure and start the game.
- `answering`: the roster, public question, round identity, and deadline are fixed.
- `revealed`: the solution, per-player round scores, and cumulative standings are available.
- `finished`: final standings and rematch availability are available until the room expires.

Every transition must be validated by the server. Clients request actions; they do not set the room phase directly.

## Server authority and security boundaries

A future multiplayer service, not the browser, must own and validate:

- room membership, player identity, and host role;
- game settings, question selection, and canonical solutions;
- room phase, round identity, frozen roster, and deadline;
- accepted submissions and duplicate detection;
- four-point scoring, reveal timing, totals, and standings;
- rematch authorization, reconnect state, and room expiry; and
- private custody of competitive prompts and solutions.

Clients may send intent such as create, join, configure, start, submit, advance, or rematch. They must never send trusted points, correctness flags, standings, host flags, authoritative timestamps, or solutions.

Every command must be authenticated, authorized for its room and phase, schema-validated, size-limited, and rate-limited. Accepted submissions need a server-enforced uniqueness rule per room, round, and player. Retryable commands need scoped idempotency keys, and serialized host transitions need concurrency control so duplicate start, advance, or rematch requests cannot fork room state.

The service must persist deadlines and complete reveal transitions reliably even when clients disconnect or infrastructure retries work. Realtime messages should carry ordered snapshot revisions, while reconnects should obtain a complete authoritative snapshot instead of depending on missed messages.

Moving only scoring to a server would be insufficient if solutions remained in public frontend assets or public repository content. Competitive multiplayer content requires a private server-side publication path.

These controls can resist forged scores, unauthorized host actions, duplicate submissions, early reveal through the normal API, and common retry or race failures. They cannot prove that a person did not search externally, collaborate out of band, use another device, or automate recognition. Future product language should describe integrity and abuse resistance, not guaranteed honest play.

## Decisions deferred until implementation

No backend vendor, realtime protocol, authentication provider, room-code format, room capacity, ranking or tie policy, host-transfer policy, reconnect duration, room expiry, or rematch setting policy has been selected. Those decisions require an implementation plan, threat model, operational budget, and verification strategy.
