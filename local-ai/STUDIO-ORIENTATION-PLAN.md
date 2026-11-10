# Studio VLM asset orientation

Baseline: e5865e1. Branch: codex/studio-vlm-orientation.

1. Snapshot all current local/cloud scene graphs and generated model/projection hashes; back up job manifests and runtime files.
2. Render the final immutable GLB from known multi-view poses. Run two local VLM observations; validate semantic conventions, evidence, agreement and uncertainty. Save versioned model-hash-bound orientation.json and review evidence.
3. Add optional asset orientation snapshots without changing existing scenes. Generated catalog placements inherit automatically; instance user_confirmed metadata retains priority. Existing placed assets can resolve the local generated-asset registry without geometry changes; revalidate asset evidence before relative edits.
4. Integrate generation and idempotent backfill into the Studio queue. Publish orientation and view artifacts to cloud; offer review with front arrow and known-view selection. Uncertain/symmetric assets remain explicit.
5. Test real VLM, existing/new Blender and TRELLIS assets, asset inheritance, overrides, arbitrary instance rotations, support links, undo, reload, local/public web calls and downloads. Compare original graphs and files before completion.

Status: in progress. No generated GLB or existing item transform will be changed to normalize a front.
