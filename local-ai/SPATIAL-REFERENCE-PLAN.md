# Furniture reference frames and relative wall editing

Baseline: `297b6ac`, branch `codex/furniture-relative-reference`.

1. Preserve existing cloud/local scene graphs and support parent relationships. All edit acceptance uses independent copies.
2. Implement one shared local-AI extension: orientation provenance, renderer-faithful item/support/building transforms, front/back/left/right frames, room-boundary ray intersections and candidate explanations. Unknown orientation, ambiguity and stale evidence refuse edits.
3. Register tools in MCP and Qwen. Require a matching fresh resolution before furniture-relative wall edits; do not silently rewrite incorrect model parameters. Calibration changes semantic metadata only.
4. Show reference frame, direction vectors, candidate walls, selection/rejection reasons and actual tool parameters in execution records.
5. Test cardinal and non-cardinal rotations, asset transforms, nested supports, translated/rotated buildings, unknown fronts, ties and stale decisions. Exercise real Qwen through local and ModelScope webpages, then verify scene preservation and persistence.

Conventions: default seating references follow the direction of use (sitting facing forward); right is forward × world up. Facing the front of an object reverses the observer's forward and right. World axes are explicitly labelled. No camera-relative claim is made without camera evidence.

Status: completed on 2026-11-10. See `SPATIAL-REFERENCE-ACCEPTANCE.md`.

- Native local and cloud MCP: 16 direction/rotation combinations per deployment, metadata-only calibration, undo and reload passed.
- Real Qwen via local webpage: yaw 90°, four directions plus right-side door passed.
- Real Qwen via ModelScope webpage: yaw 180°, four directions plus right-side door passed; decision cards and submitted parameters survived reload.
- Injected missing-evidence and wrong-wall proposals were blocked before the one correct edit.
- Original 20 local and 2 cloud scene graphs remained unchanged. Both acceptance scenes preserved existing furniture and support links.
