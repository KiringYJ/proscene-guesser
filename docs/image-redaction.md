# Deterministic image redaction

Question redaction is deterministic and auditable. Visual reasoning identifies coordinates; `scripts/apply-image-redactions.ps1` performs every pixel change. Clear cases are applied immediately by default, and a user can audit or adjust the recorded coordinates later. Never use a generative image model to produce the redacted asset.

## Files

Each production question may contain:

```text
sources/questions/<question-id>/
  original.png
  question.json
  redaction.json
  redacted.webp
```

`original.png` remains immutable. `redaction.json` is the coordinate source of truth. `redacted.webp` may be created from an auto-applied or approved redaction manifest. Its presence makes a valid question playable on the next catalog synchronization; there is no separate publication copy or status.

## Review states

- `proposed`: coordinates require review before final rendering. Use this only for material ambiguity, source drift that makes alignment uncertain, or an explicit preview-first request.
- `auto-applied`: the agent selected the coordinates and rendered the final without waiting for approval. This is the default for clear cases and remains open to later audit.
- `approved`: the user explicitly approved the current coordinates.

Both `auto-applied` and `approved` may produce final output. The renderer blocks final output only while the manifest is `proposed`.

## Redaction workflow

1. Inspect `original.png` together with `question.json` and identify only direct answer leakage.
2. Preserve inferential gameplay clues such as champions, items, KDA, gold, timer, objectives, equipment/stat panels, map state, the minimap, and generic publisher branding.
3. Record rectangles with stable IDs. Use `reviewStatus: "auto-applied"` for a clear direct application, or `"proposed"` when a review gate is actually needed.
4. Confirm that `question.json` contains source attribution and rights-review evidence. For `auto-applied` or `approved`, immediately generate the final derivative:

   ```powershell
   & scripts/apply-image-redactions.ps1 `
     -InputPath sources/questions/<question-id>/original.png `
     -ManifestPath sources/questions/<question-id>/redaction.json `
     -OutputPath sources/questions/<question-id>/redacted.webp `
     -Force
   ```

5. Run `npm run questions:sync`; the new `redacted.webp` is now part of the playable catalog. When an audit is requested, generate a green, ID-labeled preview from the same manifest:

   ```powershell
   & scripts/apply-image-redactions.ps1 `
     -InputPath sources/questions/<question-id>/original.png `
     -ManifestPath sources/questions/<question-id>/redaction.json `
     -OutputPath <audit-preview.png> `
     -Preview
   ```

6. Interpret user audit marks as follows: red means add, retain, or expand a redaction; blue means remove or shrink it; an unmarked green proposal remains unchanged.
7. Transfer corrections to the manifest coordinates against the clean original. Never render from the annotated preview. Unless the user explicitly approves the corrected set, mark it `"auto-applied"` and regenerate the final immediately.
8. Set `reviewStatus` to `"approved"` only when the user explicitly approves the current coordinates.

## Geometry invariants

Rectangle geometry can disclose hidden information. A box tightly fitted to each string can reveal the approximate length of a player or team ID.

- Use a fixed width for every repeated identifier in the same UI family. Base the width and anchor on a stable UI slot, not the rendered string.
- Use a `horizontal-mirror` geometry group for genuinely symmetric source components. The pair must have equal dimensions and exact mirrored positions.
- Do not impose symmetry when the source UI is genuinely asymmetric. Record such cases in `geometryExceptions` with the rectangle IDs and a concrete reason.
- Player-camera panels should follow their actual frame boundaries when mirroring would cover an adjacent stats/minimap region or miss part of a frame. Their fixed broadcast dimensions do not reveal player-ID length.
- After changing a geometry group or exception, use `"auto-applied"` and regenerate immediately when the result is clear. Use `"proposed"` only when the change itself requires review.

Example metadata:

```json
{
  "geometryGroups": [
    {
      "id": "roster-player-names",
      "rule": "uniform-width",
      "width": 110,
      "rectangleIds": ["blue-roster-top", "red-roster-top"]
    },
    {
      "id": "top-team-series",
      "rule": "horizontal-mirror",
      "rectangleIds": ["top-blue-team-series", "top-red-team-series"]
    }
  ],
  "geometryExceptions": [
    {
      "id": "asymmetric-player-camera-panels",
      "rectangleIds": ["blue-player-camera", "red-player-camera"],
      "reason": "The source frames have different bounds; mirroring would cover stats and miss part of the red frame."
    }
  ]
}
```

The renderer validates rectangle IDs, source dimensions and hash, geometry groups, geometry exceptions, bounds, and review status. It scales rectangle edges when a replacement source has different dimensions and warns when the source hash changes. If source drift makes alignment uncertain, mark the manifest `"proposed"` and inspect a fresh preview before final rendering.
