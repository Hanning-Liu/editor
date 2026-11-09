# Functional-zone drawing acceptance

These scripts run from the **local integration runtime root**, not this archive. They require the source editor at port 3002, the local chat/Qwen services, `playwright`, and the installed Google Chrome binary. Copy this folder into that runtime first.

1. `node zone-drawing-tests/fixture.mjs` creates a new, independently named fixture project from `seed-graph.json` and writes private `project.json` locally. Do not point the browser script at an existing user project. The fixture itself does not read or mutate user projects.
2. `node zone-drawing-tests/browser.mjs` runs actual mouse and keyboard drawing, history, reload and renderer geometry assertions on that fresh project. Run once per fresh fixture; it is not an idempotent reset command.
3. `node zone-drawing-tests/edges.mjs` follows the browser receipt on that project: invalid edits, empty remainder and a concurrent semantic rename during preview. It restores that rename and compares the complete graph.
4. `node zone-drawing-tests/qwen-fixture.mjs` creates a second independent fixture. `node zone-drawing-tests/qwen.mjs` sends the request to the real local Qwen service and verifies persisted geometry and furniture. `qwen-preview.mjs` then verifies read-only new-zone versus existing-zone preview behavior.
5. `node zone-drawing-tests/visual.mjs` captures the fully loaded 3D and 2D views; inspect the screenshots in addition to numerical assertions.

`*-report.json` are actual run receipts. Project/node IDs refer only to agent-created acceptance data. Raw model transcripts, project metadata, original user scene snapshots and reset scripts are excluded from this public archive.

The Qwen tests are end-to-end model tests, not deterministic unit tests: the first creation run misused the preview exclusion before the backend correctly recomputed the commit. After contract clarification, the read-only run initially invented IDs; the backend rejected them, and Qwen recovered by querying real IDs, then returned the correct 0 m²/33 m² previews. These refusals/recoveries are not hidden as error-free model behavior.

`preserve-report.json` records exact before/after equality of all 17 projects predating this task. The private original graphs are deliberately not published.

Source geometry provenance is in `source-evidence/label-studio-port.json`; seven actual Label Studio-generated goldens live in `packages/core/src/lib/__fixtures__/label-studio-zone-cases.json`.

Focused unit tests (repository root):

```sh
bun test packages/core/src/schema/node-union.test.ts packages/core/src/schema/compiled-node-parsers.test.ts packages/core/src/lib/functional-zone-geometry.test.ts packages/core/src/agent-operations/spatial-hierarchy.test.ts packages/mcp/src/tools/read-tool-annotations.test.ts packages/editor/src/lib/functional-zone-drawing.test.ts packages/editor/src/components/editor/group-transform-shared.test.ts
```
