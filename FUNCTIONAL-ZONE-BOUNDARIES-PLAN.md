# Shared boundary presentation plan

Base: `062488fbaa9cb41600f2d9b503f39dbda59ee7c6`; review branch: `codex/functional-zone-boundaries`.

1. Split collinear overlaps into atomic segments and deduplicate shared zone/part/hole boundaries without rewriting scene polygons. Keep ownership and floor elevation on each visual segment.
2. Render each saved boundary once with consistent dash phase in SVG and WebGPU. Use distinct display colors, neutral shared edges, and owner-aware hover/selection emphasis.
3. Route canvas boundary/label hits through a selection manager and reuse the existing semantic inspector, viewer hover and native selection state. Sync hierarchy-row hover and colors; preserve drafting and camera input ownership.
4. In an independently cloned acceptance scene, test real mouse hover/selection, shared-edge owner cycling, native inspector save, refresh and 2D/3D switching. Verify unique geometry/dash gaps and compare physical nodes plus all pre-existing projects exactly. Upload the review branch with source, focused checks and test receipts.
