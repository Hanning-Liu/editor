# Pascal + local Qwen3.8

网页 Chat 入口：http://127.0.0.1:3002 。启动：`bash start-local.sh`。完整说明见 [WEB-CHAT.md](WEB-CHAT.md)。正常建模现已开放82项工具，支持按需加载完整参数、Three.js/Blender、截图、图片分析、撤销及导出。升级计划见 [FULL-TOOLS-PLAN.md](FULL-TOOLS-PLAN.md)，逐项验收见 [TOOL-MATRIX.md](full-tools-tests/TOOL-MATRIX.md)。以下为原命令行桥接使用说明。


This isolated installation uses Pascal CLI 1.0.7 and the existing MLX environment at
`/Users/Bill_Admin/Research/nnndl/try-mlx-vlm/.venv-qwen38`.
It keeps Pascal projects under this directory's `pascal-home/data/pascal.db`.

## Start

From `/Users/Bill_Admin/Research/pascal-local-qwen38`:

```bash
npm ci
bash pascal.sh editor --no-open --json
```

The command prints the current browser URL. Its port is assigned dynamically.
In another terminal, keep the model server running:

```bash
cd /Users/Bill_Admin/Research/pascal-local-qwen38
bash qwen-server.sh
```

It serves the existing `mlx-community/Qwen3.8-27B-8bit` with matching
`mlx-community/Qwen3.8-27B-MTP-8bit` on `http://127.0.0.1:18080/v1`.
Weights are loaded from the existing cache with offline flags; no model upgrade or
download is needed. Use only one copy of this server on that port.

## Ask Qwen to operate Pascal

```bash
node agent.mjs --room-only '创建一个新项目，画一个3米乘4米、墙高2.8米的房间，检查并保存，然后返回实际项目链接。'
```

`--room-only` restricts the tool list to project, room, checking and saving tools.
Omit it for the larger experimental tool set including doors, windows and items.
Each invocation starts a new agent conversation. For continuing a project, explicitly
provide its project ID; the agent should list and load it first. Re-running a
new-project request creates another project, so read the previous transcript first
when a run is interrupted. Only run one agent against this local Pascal service at a time.

The bridge reads `pascal://agent-guide`, discovers real tool schemas, asks the
local OpenAI-compatible MLX endpoint for tool calls, executes those calls over
Pascal's stdio MCP connector, and sends the results back to Qwen. It does not
configure Codex, Claude, any hosted Pascal account, or the editor's built-in AI chat.
Publishing and forced replacement are blocked. No arbitrary shell tool is exposed.

This is a small integration prototype, not a production agent UI. It has a
16-step loop limit, no multi-turn chat history between invocations, and a bounded
tool set. The completed smoke test establishes room creation and persistence;
furniture selection, placement, and move quality need separate scenario tests.
Semantic room edits autosave and advance the stored version. Checkpoint saves
must use the latest `get_project_status` version as `expectedVersion`; the smoke
test caught and recovered from the stale-version conflict. A wall-height override
is not a storey-height change: the test's walls are 2.8 m, while its storey remains
the default 2.5 m. No-door connectivity warnings are expected for this empty-room test.

## Inspect and stop

```bash
node agent.mjs --inspect
bash pascal.sh status --json
bash pascal.sh doctor --json
bash pascal.sh stop --json
```

Stop the foreground Qwen process with Ctrl+C in its terminal. Saving and stopping
Pascal does not delete project data. Preserve `pascal-home/data` during upgrades.
`runs/*.json` records actual model messages and tool results for each run.

## Browser verification

```bash
node browser-check.mjs PROJECT_ID
```

This uses the installed Google Chrome in headless mode and saves the screenshot
and browser facts. A real interactive desktop/mobile check is still separate.

## Boundaries

- The runtime's settings currently show instance settings and Scene API access;
  no general local-model base-URL setting was verified. Use the external MCP bridge.
- Model inference here is local. Initial Pascal installation requires network
  access; default catalogs, textures and third-party plugins may also request
  remote resources. This is not proof of a completely air-gapped asset library.
- Qwen is a text/vision language model, not an image renderer or mesh generator.
  The bridge exposes geometric scene tools, not Pascal's paid cloud generation.
- Previous local image tests found errors in door direction and furniture symbols;
  model-produced geometry needs checking and user-supplied measured dimensions.

## References

- https://editor.pascal.app/docs/developers/local-editor#connect-a-local-ai-agent
- https://github.com/pascalorg/editor
- Local VLM chat: `01a0effd-5b40-7ac3-b5db-1b18000515a7`

## Local Studio (source editor, 2026-11-09)

Run `bash start-local.sh`, open `http://127.0.0.1:3002`, and click **Studio · 本地**
inside a project. This integration lives in the source editor; the separately
packaged Pascal CLI page on port 51290 does not include this Studio UI.

- **AI 效果图** uses the installed FLUX.2 Klein 9B image-edit model. Without an
  uploaded reference, a separate local browser captures the project. AI output
  can differ from the reference; applying it sets the project cover, preserving
  the 3D graph.
- **基础无缝材质** uses FLUX followed by periodic edge treatment. The flat image,
  4×4 tile preview and ZIP are downloadable. Mirror treatment can make repetition
  visible, so inspect the tile preview before use.
- **Qwen＋Blender 模型** asks local Qwen for a real bpy module. Blender builds,
  normalizes and exports the mesh, with editable `source.py` and `source.blend`.
- **完整 PBR** derives base color, normal, roughness, metalness, AO and height,
  plus packed ORM (R=AO, G=roughness, B=metalness). This is an estimate from the
  source texture and supplied parameters, not measured material recovery. Height
  is used as bump on existing surfaces; geometry displacement defaults to zero.
- **图片转 3D** runs the installed TRELLIS.2 Mac port (512 pipeline, CPU decoder,
  1024 texture). Blender normalizes the origin and scale, simplifies the result,
  exports a textured GLB and produces an interactive preview. Width controls
  uniform scale; depth and height remain proportional to the reconstruction.

Choose the target surface to apply a material: native slots for walls and built
parts, room floor finish for floors, and actual GLB `slot_` materials for furniture.
Choose level, X/Z coordinates and rotation to place a model. Generation by itself
does not place objects. Application checks the current project version and
records scene edits in the Chat undo journal.

Chat has a **本地 Studio** plugin with five asynchronous tools: capabilities,
submit, list, get and cancel. Qwen can submit generation and return a Studio link;
it does not have to keep a chat request open while a heavy job runs.

The Studio worker listens only on `127.0.0.1:18082`. Jobs, references, source
files and results persist under `studio-data/jobs/<uuid>`. Heavy jobs run one at a
time. A service restart marks unfinished jobs as interrupted; use **继续 / 重试**
to resume explicitly. Cancel stops the worker process group. Already-applied
assets remain available; do not delete `studio-data` while projects refer to them.
Keep `pascal-home/data`, `studio-data`, and `chat-data` together when backing up.

Model paths are configured in `studio/config.mjs`; overrides are
`STUDIO_MLX_PYTHON`, `STUDIO_FLUX_PATH`, `STUDIO_TRELLIS_ROOT`, `STUDIO_BLENDER`,
`LOCAL_QWEN_URL` and `LOCAL_QWEN_MODEL`. Python image work uses the installed MLX
conda environment; TRELLIS uses its own `.venv`. No paid cloud generation endpoint
is used by these adapters. Catalog furniture can still require internet access.

Reproducible acceptance scripts, downloaded outputs and screenshots are under
`studio-tests`. These scripts create or modify only the dedicated acceptance
project, not the pre-existing projects.

## Studio furniture in 2D (2026-11-09)

Successful TRELLIS.2 and Qwen + Blender model jobs automatically produce
`floorplan.png` (transparent orthographic top view) and `floorplan.json`
(source hash, axes, physical bounds and pixel calibration). Generated furniture
assets include `floorPlanUrl` alongside their GLB, dimensions and thumbnail.
The Studio result previews the top view and offers both files for download.
The native 2D view follows position, yaw and independent X/Z scale; an image
that is loading or unavailable retains a selectable footprint rectangle.

To backfill existing successful Studio models, start the local services and run
`node studio/backfill-floorplans.mjs`. It caches by source hash/projection version,
saves job and scene snapshots, and changes only each matching item's
`asset.floorPlanUrl` using version checks and protected-field readback. Existing
model GLBs and support parent/child relationships remain intact. Migration
receipts are in `studio-tests/floorplan-20261109/backfill-runs/`.
Legacy arbitrary scripted objects outside Studio are not migrated by this tool.

The five-model interaction acceptance, downloaded PNGs, screenshots, source-hash
checks and exported 3D bounds comparison are in
`studio-tests/floorplan-20261109/`; see `FLOORPLAN-PLAN.md` and `acceptance.json`.

`bash start-local.sh` keeps the four source services running through transient
macOS launchd jobs and is safe to run again. Use
`node service-control.mjs studio restart` to restart Studio or replace `studio`
with `editor`, `chat` or `qwen`. `stop` stops a service. These jobs do not install
login agents; rerun the startup script after a system restart. Source services
use the same local data folders as before.
