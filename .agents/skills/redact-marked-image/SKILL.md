---
name: redact-marked-image
description: Identify answer-revealing regions in a question image, optionally using rough red circles, record auditable coordinates, and cover them with deterministic opaque black rectangles. Clear cases are auto-applied immediately and remain available for later red/blue audit. Use when the user asks to redact, censor, hide, black out, or prepare an image-redaction audit while preserving gameplay clues and unrelated content.
---

# Redact Marked Image

## Required Outcome

Produce an auditable coordinate manifest and, for clear cases, immediately return a flattened raster image in which every target is fully covered by an opaque, axis-aligned, solid-black rectangle. Preserve gameplay evidence and unrelated content exactly. User approval is optional before application; later audits revise the manifest and regenerate the image.

## Workflow

1. Inspect `original.png` and `question.json` at high detail. If a marked copy exists, treat its colored circles, boxes, arrows, or scribbles as audit guidance rather than exact rectangle edges.
2. Identify regions that directly reveal the answer. The default candidates are team names or logos, player names, event/year/stage text, answer-revealing series labels, and player-camera details that identify a player or team.
3. Preserve inferential gameplay clues by default: champions, items, equipment/stat columns, KDA, gold, timer, objectives, map state, and minimap. Preserve generic publisher or broadcast branding such as the Riot Games logo unless it directly answers the question or the user explicitly asks to remove it.
4. Do not use a generative image model to perform the edit. The model identifies targets and selects coordinates only; the deterministic script owns every pixel change.
5. Record coordinates in `sources/questions/<question-id>/redaction.json` with reference dimensions, source SHA-256, and a stable descriptive ID for every rectangle. Treat this manifest as the reproducible source of truth. Use `reviewStatus: "auto-applied"` by default when the target set is clear, `"proposed"` for material ambiguity or an explicit preview-first request, and `"approved"` only after explicit user approval.
6. For an `auto-applied` or `approved` manifest, immediately run the deterministic script without `-Preview` to create or replace the final flattened PNG or lossless WebP. The script overwrites only recorded rectangles with opaque `#000000` pixels.
7. Generate a labeled audit preview when the user requests an audit or when ambiguity requires review:

   ```powershell
   & scripts/apply-image-redactions.ps1 `
     -InputPath <clean-image> `
     -ManifestPath <redaction.json> `
     -OutputPath <temporary-preview.png> `
     -Preview
   ```

8. Apply red/blue audit corrections to coordinates against the clean original; never render from the annotated preview. Unless the user explicitly approves the corrected set, mark it `"auto-applied"` and regenerate the final immediately.
9. If the source image changes, update its dimensions and SHA-256. Continue as `"auto-applied"` only when the same layout and scaled coordinates remain clearly valid; otherwise use `"proposed"` and inspect a new preview before final rendering.
10. Preserve the original canvas dimensions, crop, orientation, and all content outside the rectangles. The final must not contain preview outlines, labels, blur, pixelation, enhancement, or unrelated edits.
11. Inspect the final result at high detail. Confirm that no target content remains visible, every cover is fully opaque black, no target was missed, and no preserved clue was covered.
12. Keep the original unchanged. Delete temporary previews after verification and do not add the unredacted source to a public asset directory.

## Coordinate Manifest

- Store coordinates as reference-image pixels with top-left origin.
- Let the script scale rectangle edges when the input dimensions differ from `coordinateSpace`.
- Keep `source.sha256` as drift evidence. A mismatch warns but does not block previewing a replacement source.
- Keep rectangle IDs stable. Edit only their coordinates for small adjustments.
- Use `reviewStatus: "auto-applied"` for the normal immediate-application path, `"proposed"` when final rendering must wait for review, and `"approved"` only after explicit user approval.
- Use ad hoc `-Rectangle 'x,y,width,height'` arguments only before a manifest exists.

## Geometry Normalization

- Treat rectangle dimensions as potentially observable information. A tight box around each string can leak the approximate length of a hidden team or player ID.
- Use one fixed width for every repeated identifier in the same layout family, such as roster names or floating player nameplates. Choose the family width from the stable UI slot plus a safety margin, never from each string's measured width.
- Anchor fixed-width roster boxes to the outer screen edge. Anchor floating nameplate boxes to the stable nameplate center or another non-text UI feature, not to a string edge.
- When the underlying broadcast UI is symmetric, record the two regions as a `horizontal-mirror` geometry group and use exact mirrored coordinates and equal dimensions. Do not force symmetry on UI components whose source layout is genuinely asymmetric.
- Record repeated regions in `geometryGroups`. Use `uniform-width` to declare a family width and `horizontal-mirror` to declare a mirrored pair. The deterministic renderer validates these rules before producing either a preview or final image.
- Record genuinely asymmetric members of one semantic family in `geometryExceptions`, including the stable rectangle IDs and a concrete source-layout reason. Player-camera panels are a common example: follow each actual frame boundary when mirroring would cover the center stats panel or miss part of a camera frame.
- After changing a family width, anchor, or mirror rule, use `"auto-applied"` and regenerate immediately when the result is clear. Use `"proposed"` only when the geometry change requires review.

## Color Audit Protocol

- Green rectangles and labels are model-proposed regions in the generated preview.
- Red user markup means the enclosed content should be redacted. Add a new named region or adjust the matching proposal to cover the content with a small safety margin.
- Blue user markup means the enclosed content should remain visible. Remove the matching proposed region or shrink it so the blue-designated content is preserved.
- An unmarked green proposal remains unchanged. This lets the user mark only corrections instead of re-approving every region.
- If red and blue marks conflict on the same content, keep the manifest `proposed` and request one concise clarification for that conflict only.
- Never render from the annotated audit image. Read coordinates from it, compensate for any display scaling, and apply the updated manifest to the clean original.

## Ambiguity and Safety

- Distinguish deliberate red or blue audit markup from naturally colored image content by stroke shape, saturation, and context.
- When no marked copy is provided, identify direct answer leakage yourself and auto-apply a narrowly scoped result. Use `"proposed"` only when uncertainty could materially cover preserved clues or leave direct leakage visible.
- If the answer or intended redaction purpose cannot be established from `question.json`, stop and request the missing information.
- Never implement the redaction as CSS, an annotation layer, transparency, or another removable overlay.
- Do not infer that a large neighboring panel is part of a target merely because it touches an answer-revealing label.
- Do not convert weak, inferential clues into redactions merely because they could help an expert guess the answer; the purpose is to remove direct answer leakage, not all evidence.
- Strip metadata before publication and do not claim forensic-grade erasure from visual inspection alone.
