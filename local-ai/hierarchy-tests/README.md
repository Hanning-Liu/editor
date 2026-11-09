# Spatial hierarchy acceptance

Run from the restored local runtime workspace described in ../../LOCAL-AI-INTEGRATION.md.

- `native.mjs` creates/reuses the dedicated native acceptance project, prepares a room with table/chair/Toy support, and tests semantic creation, edit, transform, native undo/redo and semantic-only deletion. It writes local fixture receipts.
- `browser.mjs` consumes those receipts. Start from the item-only fixture, then create/edit the functional zone and group through the real UI, rotate/translate, undo/redo and refresh. A replay needs resetting only that dedicated fixture to its generated fixture-before.json using the current scene version; it must not reset another project.
- `qwen-create.mjs` creates/reuses a separate Qwen acceptance project cloned from the generated item-only fixture. It makes actual local-model calls; replay from an already edited group requires resetting only that dedicated test project first.
- `qwen-transform.mjs` exercises model-driven edit/transform/undo. `qwen-refresh.mjs` reads the saved Qwen scene through the browser without autosave.
- `acceptance.mjs` validates the generated reports, current saved test scenes, service health, and an original-scenes.json captured read-only before the run. That original scene snapshot remains local and is not included in Git.

The JSON receipts committed here document the verified run on 2026-11-09; they are not a claim that another machine has the same projects, model paths or services. Browser tests use local Chrome. Actual model runs need the configured local Qwen server. Generated screenshots and all private scene/chat snapshots remain outside the source receipts, except the dedicated demonstration screenshots under docs/media/spatial-hierarchy/.
