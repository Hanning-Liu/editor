# Interaction acceptance

Run these from the runtime folder after restoring `local-ai/` and starting the services. Requires Playwright and Chrome at the path in the scripts (change it for another installation).

1. `node hierarchy-ux-tests/snapshot.mjs`: retain private before-snapshots of existing projects locally.
2. `node hierarchy-ux-tests/fixture.mjs`: create a new dedicated project from the supplied public-asset test seed; writes its generated IDs to `project.json`.
3. `node hierarchy-ux-tests/browser.mjs`: phase 1 menus, properties, selection-derived creation, assignment, undo/redo. Keep the editor source unchanged while this runs: development hot reload can reset in-memory undo history.
4. `node hierarchy-ux-tests/edges.mjs`: editing after reassignment, single-root move handles, exact undo restoration, keyboard controls.
5. `node hierarchy-ux-tests/gizmos.mjs`: actual 2D/3D pointer drags, anchor preservation, undo/redo and refresh. The 3D test reads the development renderer's scene/camera to locate the real raycast target, then uses actual mouse input; it does not call scene-editing helpers to simulate a gesture.
6. `node hierarchy-ux-tests/qwen-read.mjs`: the real local model queries the resulting hierarchy; asserts that the scene graph stays unchanged.
7. `node hierarchy-ux-tests/acceptance.mjs`: compare existing project graphs and service health.

Run sequentially, stopping on the first failure. API polls are spaced to respect the scene service's rate limit. Never reset or replay tests against an existing personal project. The fixture script always creates a new project. Snapshots, chat transcripts, generated project IDs and runtime failure images are not part of the source archive. Uploaded receipts refer only to agent-created acceptance fixtures.
