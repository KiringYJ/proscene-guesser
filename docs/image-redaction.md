# Deterministic image redaction

Question redaction is a two-stage, auditable process. Visual reasoning proposes coordinates; `scripts/apply-image-redactions.ps1` performs every pixel change. Never use a generative image model to produce the redacted asset.

## Files

Each production question may contain:

```text
sources/questions/<question-id>/
  original.png
  question.json
  redaction.json
  redacted.webp
```

`original.png` remains immutable. `redaction.json` is the coordinate source of truth. `redacted.webp` is created only from an approved manifest and remains a draft until the question's publication requirements are satisfied.

## Audit workflow

1. Inspect `original.png` together with `question.json` and identify only direct answer leakage.
2. Preserve inferential gameplay clues such as champions, items, KDA, gold, timer, objectives, equipment/stat panels, map state, the minimap, and generic publisher branding.
3. Record candidate rectangles with stable IDs and `reviewStatus: "proposed"`.
4. Generate a green, ID-labeled preview:

   ```powershell
   & scripts/apply-image-redactions.ps1 `
     -InputPath sources/questions/<question-id>/original.png `
     -ManifestPath sources/questions/<question-id>/redaction.json `
     -OutputPath <audit-preview.png> `
     -Preview
   ```

5. Interpret user audit marks as follows: red means add, retain, or expand a redaction; blue means remove or shrink it; an unmarked green proposal remains unchanged.
6. Transfer corrections to the manifest coordinates against the clean original. Never render from the annotated preview.
7. Set `reviewStatus` to `"approved"` only after the audit. The renderer refuses to create a final image from a proposed manifest.

## Geometry invariants

Rectangle geometry can disclose hidden information. A box tightly fitted to each string can reveal the approximate length of a player or team ID.

- Use a fixed width for every repeated identifier in the same UI family. Base the width and anchor on a stable UI slot, not the rendered string.
- Use a `horizontal-mirror` geometry group for genuinely symmetric source components. The pair must have equal dimensions and exact mirrored positions.
- Do not impose symmetry when the source UI is genuinely asymmetric. Record such cases in `geometryExceptions` with the rectangle IDs and a concrete reason.
- Player-camera panels should follow their actual frame boundaries when mirroring would cover an adjacent stats/minimap region or miss part of a frame. Their fixed broadcast dimensions do not reveal player-ID length.
- Reset the manifest to `"proposed"` after changing a geometry group or exception.

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

The renderer validates rectangle IDs, source dimensions and hash, geometry groups, geometry exceptions, bounds, and approval status. It scales rectangle edges when a replacement source has different dimensions and warns when the source hash changes; a changed source still requires a new preview audit.
