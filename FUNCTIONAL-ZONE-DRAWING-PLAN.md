# Functional-zone geometry and interaction plan

Base: e072b7cd401ec1b3c3f582e3a09c917b6d1912e4.

1. Reuse the Label Studio customization's validated ring/topology rules and its seven boolean geometry fixtures. Adapt image coordinates to level-local metres, preserve small real features, disjoint components and holes, and retain provenance of the port.
2. Extend the native functional-zone node with primary holes and additional polygon parts (default empty). Keep one logical zone ID and existing references; old single-ring scenes remain valid.
3. Add rectangle/polygon drafting, direct vertex/edge editing, hole/part creation and remaining-area preview to the existing inspector and 2D scene. Drafts stay transient until an explicit apply. Reuse the Pascal interaction scope, snapping and history boundaries. Display geometry in both 2D and 3D.
4. Extend the shared Qwen/MCP contracts for complex geometry and deterministic remaining-area preview/commit. Keep normal furniture/support data out of zone writes.
5. Validate migrated geometry cases, holes/disjoint/concave parents, invalid edits and stale previews; run browser pointer tests, real Qwen tests, save/reload/undo, service health and exact before/after comparisons of all original project graphs. Publish the review branch and evidence.
