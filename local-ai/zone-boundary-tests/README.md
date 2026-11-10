# Shared functional-zone boundary acceptance

Run from the local integration runtime root after copying this directory there. Required: source editor at `http://127.0.0.1:3002`, its existing MCP/session dependencies, Playwright and Google Chrome at the macOS application path used by the scripts.

1. `node zone-boundary-tests/snapshot.mjs` reads all current project graphs and writes a **private** baseline. Do this before creating the new fixture.
2. `node zone-boundary-tests/fixture.mjs` clones only the included public-catalog acceptance seed into a new project and writes private `project.json`. It does not write any pre-existing project.
3. `node zone-boundary-tests/browser.mjs` uses actual SVG mouse events to check deduplication, colors, hover, hierarchy/label selection and shared-boundary owner cycling. It saves one acceptance name through the native inspector, reloads, switches 2D/3D, examines the actual WebGPU geometry and compares every stored node. Repeated runs toggle the acceptance suffix without accumulating names.
4. `node zone-boundary-tests/interaction-3d.mjs` projects actual dashed 3D boundary vertices to screen coordinates and uses the mouse to hover/click. It verifies owner cycling, tree hover and an exactly unchanged graph.
5. `node zone-boundary-tests/visual.mjs` frames and captures both views for visual inspection.
6. `node zone-boundary-tests/preserve.mjs` compares complete graphs of all projects captured in step 1 and checks service health.

Reports are receipts from actual runs. Raw original scene graphs, local project metadata and failure screenshots are excluded. Seed and receipt IDs describe agent-created acceptance data only. Do not substitute user project IDs for this fixture.

The 3D test exposed the editor's independent DOM grid click clearing a semantic selection after pointer release. The final implementation uses the existing native `swallowNextClick` helper; a stable boundary object preserves the raycast target while material color/opacity change. Picking uses a pure query with a local line threshold, without mutating the shared raycaster.

Repository-root focused tests:

```sh
bun test packages/editor/src/lib/functional-zone-boundaries.test.ts packages/editor/src/lib/functional-zone-selection.test.ts packages/editor/src/lib/spatial-hierarchy.test.ts packages/editor/src/components/editor/group-transform-shared.test.ts
```
