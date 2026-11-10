# Furniture reference frames and wall evidence

The local Chat worker and MCP bridge share three extension tools. They do not change Pascal's node schema or reparent furniture.

| Tool | Purpose | Writes |
| --- | --- | --- |
| `spatial_get_furniture_frame` | Front provenance; parent/support and building transforms; four direction vectors | None |
| `spatial_resolve_relative_wall` | Cast a direction from the furniture anchor to the first boundary of its room; explain every candidate wall | None |
| `spatial_set_furniture_front` | Record an explicitly confirmed model-local front axis in `metadata.spatialReference` | Metadata only, through normal history and persistence |

## Reference conventions

- `use_direction` is the default: look along the furniture's use direction, seated for seating. Right is forward cross world up.
- `facing_front` means an observer standing in front and looking at the object. Front/back and left/right reverse.
- `world` means explicitly requested world axes: right +X, front -Z.
- Screen/camera-relative requests cannot be inferred without current camera evidence.

Only the reviewed built-in Sofa (`sofa`, `/items/sofa/model.glb`, library) has a built-in +Z front. Other assets require confirmation, for example: “为家具 item_… 标定：模型本地正面 +Z。” The Chat worker requires the calibration quote to appear in the current user message and name the matching model-local axis. A name, rotation=0, a prior assistant claim or a guessed asset front is not evidence. Replacing an asset invalidates its saved calibration.

Asset rotation and scale, instance rotation/scale, supporting item rotations and positions, and building/site transforms are composed as the renderer does. Model scale and asset corrections do **not** transform supported child nodes. Floor elevation is unnecessary for the X/Z wall query. The origin is the placement anchor, not an inferred mesh centroid.

## Editing guard

For a furniture-relative wall/door/window request, the worker determines the furniture, reference frame and requested relation from the current message. Before a mutation it requires a successful, matching resolution with the same scene fingerprint. It rejects an unsupported frame, multiple candidate furniture, multiple edit directions, a wrong wall, an unknown front, a corner tie, an overlapping-room ambiguity without a user-named room (an agent-supplied roomId does not establish this), curved boundaries or stale evidence. It never silently rewrites a wrong model argument.

Door/window t (or position) and numeric width are checked against the current room's span of a shared wall, including default values. Generic patches/code and unrelated editing tools cannot bypass this check during the relative-wall task. Additional read-only direction queries can be recorded without authorizing edits to those other directions. After an edit, prior resolutions are cleared. A concurrent scene change stops the run; the next run must reload and resolve again. Complex multi-direction editing should be split into explicit single-direction commands; a single read-only query can inspect all four directions.

The resolver reports candidate IDs, room spans, intersections, distances and selection/rejection reasons. Opening events carry the actual submitted tool parameters and the corresponding resolution. Rejected edits carry their rejected arguments. The webpage presents this in the execution record, backed by persisted tool events and available after refresh. This is inspectable calculation/tool evidence, not a recovered private model reasoning trace. `verify_scene` still validates geometry and does not establish that a natural-language direction was interpreted correctly.

## Source checkout and tests

The standalone worker resolves the editor checkout through `editor-src`. From the repository root, prepare `local-ai/editor-src -> ..`, install `local-ai/package.json` dependencies with `npm ci`, and build the core/MCP packages. Deployed workers may point `editor-src` at the selected checkout instead. Runtime data, credentials and this symlink are excluded from Git.

Run with Node 22:

```
node --test local-ai/cloud-tests/spatial-reference.test.mjs local-ai/cloud-tests/relative-edit-policy.test.mjs
```

`spatial-mcp-smoke.mjs` registers the actual stdio tools. `spatial-chat-guard.mjs <evidence-root>` uses a deliberately wrong test model, the real Chat loop and MCP runner, and independent acceptance projects to check that missing evidence and wrong walls are blocked before the one correct opening. `spatial-live.mjs <evidence-root/local-or-cloud> local|cloud` creates an independent scene copy from the preserved cloud input and checks all 16 rotated directions plus metadata-only calibration, undo and reload. `spatial-audit.mjs <acceptance-dir> door|directions` verifies real Qwen records and compares the resulting geometry/supports. Live tests require the intended editor/store environment; production secrets are never included in the repository.

ModelScope can reject burst RPC calls with HTTP 429. The remote store retries only these explicit pre-execution rejections, up to six attempts with bounded Retry-After/exponential waits. It does not replay uncertain transport failures or 5xx writes. Structured platform errors retain their method and HTTP status instead of becoming `[object Object]`.
