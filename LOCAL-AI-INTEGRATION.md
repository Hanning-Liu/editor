# 本地 Chat AI agent 与 Studio 接入快照

这是新增功能分区和家具组团之前的 GitHub 检查点。

- 上游仓库：<https://github.com/pascalorg/editor>
- 本地实际基线：`7d45390fd49bc7700402e4adaa5b6936a50594bc`（Pascal 包版本 1.0.7）。
- 个人 fork：<https://github.com/Hanning-Liu/editor>。
- 本分支：`codex/local-ai-studio-baseline`。
- 对比基线分支：`codex/upstream-20261109`，固定指向上述上游提交，避免 fork 较旧的 main 混入上游历史差异。
- `main` 与已有其他分支保持不变。

## 已完成的功能与对应代码

| 功能 | 主要文件 |
|---|---|
| 网页 Chat、历史、附件、模型及推理预设、插件与上下文详情 | `apps/editor/components/local-chat.tsx`，`apps/editor/app/api/local-chat/route.ts`，`local-ai/chat-server.mjs`，`local-ai/chat-features.mjs` |
| Qwen 工具发现、建模调用、隔离几何脚本、撤销记录、文件交付 | `local-ai/tool-registry.mjs`，`local-ai/mcp-session.mjs`，`local-ai/local-mcp.ts`，`local-ai/geometry-adapter-worker.mjs`，`local-ai/scene-journal.mjs`，`local-ai/tool-files.mjs` |
| 网页 Studio、任务管理、预览、应用及下载 | `apps/editor/components/local-studio.tsx`，`local-studio-preview.tsx`，`apps/editor/app/api/local-studio/route.ts`，`local-ai/studio/server.mjs` |
| FLUX 效果图、无缝材质及估算 PBR | `local-ai/studio/image_worker.py`，`engine.mjs`，`config.mjs`，`packages/core/src/schema/material.ts`，`packages/viewer/src/lib/materials.ts` |
| Qwen＋Blender、TRELLIS.2 家具生成 | `local-ai/studio/engine.mjs`，`blender_worker.py`，`store.mjs` |
| 模型透明俯视图、floorPlanUrl、旧资产安全回填 | `local-ai/studio/floorplan_worker.py`，`floorplan.mjs`，`backfill-floorplans.mjs`，`packages/nodes/src/item/floorplan.ts`，`packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.tsx` |
| 独立浏览器截图及真实 GLB 导出 | `apps/editor/components/local-capture.ts`，`local-ai/render-scene.mjs`，`packages/mcp/src/tools/view-scene.ts`，`export-glb.ts` |
| macOS 后台启动 | `local-ai/start-local.sh`，`service-control.mjs`，`run-local-service.sh`，`qwen-server.sh` |

`schema/material.ts` 的改动是已完成 PBR 接入所需的贴图字段。当前没有 `FunctionalZone` / `FurnitureGroup` schema、相关工具或场景树修改。

## 仓库与本地运行目录的对应

为了保持 Pascal 的上游 monorepo 布局，原本位于源码目录之外的服务代码归档在 `local-ai/`。`local-ai/snapshot-files.json` 记录 99 个原始文件的 SHA-256，归档源文件与本机运行目录逐文件一致。Pascal 目录内另做了格式和三处 ARIA 角色修正，以通过现有提交检查。

当前电脑正在使用的布局是：

```text
pascal-local-qwen38/
├── editor-src/       # 此 GitHub 仓库
├── chat-server.mjs   # 仓库 local-ai/ 中的相同源文件
├── studio/
├── pascal-home/      # 本机数据库与运行状态
└── studio-data/      # 本机生成结果
```

在另一目录重建同样布局（此命令不会携带本机项目或模型权重）：

```bash
mkdir pascal-local-qwen38
cd pascal-local-qwen38
git clone --branch codex/local-ai-studio-baseline https://github.com/Hanning-Liu/editor.git editor-src
cp -R editor-src/local-ai/. .
npm ci
cd editor-src
bun install --frozen-lockfile
cd packages/core && bun run build
cd ../nodes && bun run build
cd ../viewer && bun run build
cd ../mcp && bun run build
cd ../../../
```

运行前需要安装/配置本地 Qwen MLX 环境、FLUX、Blender、TRELLIS.2 与 Chrome。`qwen-server.sh` 仍记录当前电脑的 Qwen 环境路径，换机器时需要修改。Studio 支持 `STUDIO_MLX_PYTHON`、`STUDIO_TRELLIS_ROOT`、`STUDIO_BLENDER`、`STUDIO_FLUX_PATH`、`LOCAL_QWEN_URL`、`LOCAL_QWEN_MODEL` 环境变量，配置说明见 `local-ai/README.md`。这是当前工作成果的源码快照，不声称换机器后无需配置即可运行。

配置完成后，在上述父目录运行 `bash start-local.sh`，打开 <http://127.0.0.1:3002>。

## 验证记录与边界

本次上传前重新执行：

- `bun test packages/nodes/src/item/plan-symbols.test.ts packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.test.tsx packages/viewer/src/lib/materials.test.ts`：39 项通过。
- `packages/editor` 的 `bun run check-types`：通过。
- `apps/editor` 的 `bun x tsc --noEmit`：通过。
- 归档服务源代码的 JS、Python、shell 语法检查和原文件 SHA-256 比对：通过。
- 保留并执行仓库原有 Git 提交与推送检查；没有绕过 hooks。

较早的五模型完整交互验收摘要在 `local-ai/verification/floorplan-acceptance-summary.json`。它记录当时执行的 2D/3D、拖动、旋转、缩放、刷新、失败兜底和下载验证，不是本次重新运行全部生成任务的声明。各次计划及测试脚本一并归档，旧文档中的状态和项目 ID 属于当时快照；以此文件描述的当前归档范围为准。

没有上传数据库、聊天记录/附件、项目布局快照、密钥、模型权重、生成 GLB/图片、依赖目录或构建缓存。重建源代码不会恢复这些本机数据。

## 完整文件差异清单

`M` 表示修改上游已有文件，`A` 表示新增文件。以下为本检查点相对固定上游基线的清单，另包含本说明文件。

| 状态 | 文件 |
|---|---|
| M | [.gitignore](.gitignore) |
| M | [README.md](README.md) |
| A | [apps/editor/app/api/local-chat/route.ts](apps/editor/app/api/local-chat/route.ts) |
| A | [apps/editor/app/api/local-studio/route.ts](apps/editor/app/api/local-studio/route.ts) |
| M | [apps/editor/components/editor-navbar.tsx](apps/editor/components/editor-navbar.tsx) |
| A | [apps/editor/components/local-capture.ts](apps/editor/components/local-capture.ts) |
| A | [apps/editor/components/local-chat.tsx](apps/editor/components/local-chat.tsx) |
| A | [apps/editor/components/local-studio-preview.tsx](apps/editor/components/local-studio-preview.tsx) |
| A | [apps/editor/components/local-studio.tsx](apps/editor/components/local-studio.tsx) |
| M | [apps/editor/components/scene-loader.tsx](apps/editor/components/scene-loader.tsx) |
| M | [apps/editor/next.config.ts](apps/editor/next.config.ts) |
| A | [local-ai/DELIVERY.md](local-ai/DELIVERY.md) |
| A | [local-ai/FLOORPLAN-PLAN.md](local-ai/FLOORPLAN-PLAN.md) |
| A | [local-ai/FULL-TOOLS-PLAN.md](local-ai/FULL-TOOLS-PLAN.md) |
| A | [local-ai/PLAN.md](local-ai/PLAN.md) |
| A | [local-ai/README.md](local-ai/README.md) |
| A | [local-ai/STUDIO-PLAN.md](local-ai/STUDIO-PLAN.md) |
| A | [local-ai/WEB-CHAT.md](local-ai/WEB-CHAT.md) |
| A | [local-ai/agent.mjs](local-ai/agent.mjs) |
| A | [local-ai/all-tools.json](local-ai/all-tools.json) |
| A | [local-ai/brief-probe.mjs](local-ai/brief-probe.mjs) |
| A | [local-ai/browser-check.mjs](local-ai/browser-check.mjs) |
| A | [local-ai/chat-boundary-check.mjs](local-ai/chat-boundary-check.mjs) |
| A | [local-ai/chat-features.mjs](local-ai/chat-features.mjs) |
| A | [local-ai/chat-server.mjs](local-ai/chat-server.mjs) |
| A | [local-ai/controls-tests/check-api.mjs](local-ai/controls-tests/check-api.mjs) |
| A | [local-ai/controls-tests/check-history.mjs](local-ai/controls-tests/check-history.mjs) |
| A | [local-ai/controls-tests/check-model.mjs](local-ai/controls-tests/check-model.mjs) |
| A | [local-ai/controls-tests/check-ui-send.mjs](local-ai/controls-tests/check-ui-send.mjs) |
| A | [local-ai/controls-tests/check-ui.mjs](local-ai/controls-tests/check-ui.mjs) |
| A | [local-ai/create-chat-test.mjs](local-ai/create-chat-test.mjs) |
| A | [local-ai/full-tools-tests/TOOL-MATRIX.md](local-ai/full-tools-tests/TOOL-MATRIX.md) |
| A | [local-ai/full-tools-tests/check-download-ui.mjs](local-ai/full-tools-tests/check-download-ui.mjs) |
| A | [local-ai/full-tools-tests/check-ui.mjs](local-ai/full-tools-tests/check-ui.mjs) |
| A | [local-ai/full-tools-tests/debug-legacy.mjs](local-ai/full-tools-tests/debug-legacy.mjs) |
| A | [local-ai/full-tools-tests/native-extended.mjs](local-ai/full-tools-tests/native-extended.mjs) |
| A | [local-ai/full-tools-tests/native-retry.mjs](local-ai/full-tools-tests/native-retry.mjs) |
| A | [local-ai/full-tools-tests/native-smoke.mjs](local-ai/full-tools-tests/native-smoke.mjs) |
| A | [local-ai/full-tools-tests/qwen-run.mjs](local-ai/full-tools-tests/qwen-run.mjs) |
| A | [local-ai/full-tools-tests/registry.test.mjs](local-ai/full-tools-tests/registry.test.mjs) |
| A | [local-ai/full-tools-tests/roof-migration-persisted.ts](local-ai/full-tools-tests/roof-migration-persisted.ts) |
| A | [local-ai/full-tools-tests/roof-migration.ts](local-ai/full-tools-tests/roof-migration.ts) |
| A | [local-ai/full-tools-tests/stop.mjs](local-ai/full-tools-tests/stop.mjs) |
| A | [local-ai/full-tools-tests/summarize.mjs](local-ai/full-tools-tests/summarize.mjs) |
| A | [local-ai/full-tools-tests/vision.mjs](local-ai/full-tools-tests/vision.mjs) |
| A | [local-ai/geometry-adapter-worker.mjs](local-ai/geometry-adapter-worker.mjs) |
| A | [local-ai/inspect-web-scene.mjs](local-ai/inspect-web-scene.mjs) |
| A | [local-ai/inventory.mjs](local-ai/inventory.mjs) |
| A | [local-ai/local-mcp.ts](local-ai/local-mcp.ts) |
| A | [local-ai/local-models.example.json](local-ai/local-models.example.json) |
| A | [local-ai/mcp-session.mjs](local-ai/mcp-session.mjs) |
| A | [local-ai/package.json](local-ai/package.json) |
| A | [local-ai/package-lock.json](local-ai/package-lock.json) |
| A | [local-ai/pascal.sh](local-ai/pascal.sh) |
| A | [local-ai/qwen-server.sh](local-ai/qwen-server.sh) |
| A | [local-ai/reliability-tests/roof-and-disconnect.mjs](local-ai/reliability-tests/roof-and-disconnect.mjs) |
| A | [local-ai/reliability-tests/roof-snapshot.mjs](local-ai/reliability-tests/roof-snapshot.mjs) |
| A | [local-ai/reliability-tests/stop-and-ui.mjs](local-ai/reliability-tests/stop-and-ui.mjs) |
| A | [local-ai/render-scene.mjs](local-ai/render-scene.mjs) |
| A | [local-ai/run-local-service.sh](local-ai/run-local-service.sh) |
| A | [local-ai/scene-journal.mjs](local-ai/scene-journal.mjs) |
| A | [local-ai/service-control.mjs](local-ai/service-control.mjs) |
| A | [local-ai/snapshot-files.json](local-ai/snapshot-files.json) |
| A | [local-ai/start-local.sh](local-ai/start-local.sh) |
| A | [local-ai/studio-tests/api-guards.mjs](local-ai/studio-tests/api-guards.mjs) |
| A | [local-ai/studio-tests/cancel-resume-ui.mjs](local-ai/studio-tests/cancel-resume-ui.mjs) |
| A | [local-ai/studio-tests/check-current-2d.mjs](local-ai/studio-tests/check-current-2d.mjs) |
| A | [local-ai/studio-tests/console-diagnostics.mjs](local-ai/studio-tests/console-diagnostics.mjs) |
| A | [local-ai/studio-tests/export-scene-pbr.mjs](local-ai/studio-tests/export-scene-pbr.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/acceptance-final.mjs](local-ai/studio-tests/floorplan-20261109/acceptance-final.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/apply-assets-ui.mjs](local-ai/studio-tests/floorplan-20261109/apply-assets-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/image-fallback-ui.mjs](local-ai/studio-tests/floorplan-20261109/image-fallback-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/interactions-ui.mjs](local-ai/studio-tests/floorplan-20261109/interactions-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/new-blender-ui.mjs](local-ai/studio-tests/floorplan-20261109/new-blender-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/new-round-ui.mjs](local-ai/studio-tests/floorplan-20261109/new-round-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/new-trellis-ui.mjs](local-ai/studio-tests/floorplan-20261109/new-trellis-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/original-scene-ui.mjs](local-ai/studio-tests/floorplan-20261109/original-scene-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/plan-download-ui.mjs](local-ai/studio-tests/floorplan-20261109/plan-download-ui.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/setup.mjs](local-ai/studio-tests/floorplan-20261109/setup.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/validate-projections.mjs](local-ai/studio-tests/floorplan-20261109/validate-projections.mjs) |
| A | [local-ai/studio-tests/floorplan-20261109/verify-3d-bounds.mjs](local-ai/studio-tests/floorplan-20261109/verify-3d-bounds.mjs) |
| A | [local-ai/studio-tests/pbr-final-submit.mjs](local-ai/studio-tests/pbr-final-submit.mjs) |
| A | [local-ai/studio-tests/pbr-trellis-ui.mjs](local-ai/studio-tests/pbr-trellis-ui.mjs) |
| A | [local-ai/studio-tests/qwen-studio.mjs](local-ai/studio-tests/qwen-studio.mjs) |
| A | [local-ai/studio-tests/refresh-all-ui.mjs](local-ai/studio-tests/refresh-all-ui.mjs) |
| A | [local-ai/studio-tests/render-preserve-ui.mjs](local-ai/studio-tests/render-preserve-ui.mjs) |
| A | [local-ai/studio-tests/scene-capture.mjs](local-ai/studio-tests/scene-capture.mjs) |
| A | [local-ai/studio-tests/submit-ui.mjs](local-ai/studio-tests/submit-ui.mjs) |
| A | [local-ai/studio-tests/summarize-protected.mjs](local-ai/studio-tests/summarize-protected.mjs) |
| A | [local-ai/studio-tests/surface-ui.mjs](local-ai/studio-tests/surface-ui.mjs) |
| A | [local-ai/studio-tests/verify-pbr-final-ui.mjs](local-ai/studio-tests/verify-pbr-final-ui.mjs) |
| A | [local-ai/studio-tests/verify-resumed-ui.mjs](local-ai/studio-tests/verify-resumed-ui.mjs) |
| A | [local-ai/studio-tests/verify-three-ui.mjs](local-ai/studio-tests/verify-three-ui.mjs) |
| A | [local-ai/studio-tests/verify-trellis-ui.mjs](local-ai/studio-tests/verify-trellis-ui.mjs) |
| A | [local-ai/studio/backfill-floorplans.mjs](local-ai/studio/backfill-floorplans.mjs) |
| A | [local-ai/studio/blender_worker.py](local-ai/studio/blender_worker.py) |
| A | [local-ai/studio/config.mjs](local-ai/studio/config.mjs) |
| A | [local-ai/studio/engine.mjs](local-ai/studio/engine.mjs) |
| A | [local-ai/studio/floorplan.mjs](local-ai/studio/floorplan.mjs) |
| A | [local-ai/studio/floorplan_worker.py](local-ai/studio/floorplan_worker.py) |
| A | [local-ai/studio/image_worker.py](local-ai/studio/image_worker.py) |
| A | [local-ai/studio/mcp-tools.ts](local-ai/studio/mcp-tools.ts) |
| A | [local-ai/studio/server.mjs](local-ai/studio/server.mjs) |
| A | [local-ai/studio/store.mjs](local-ai/studio/store.mjs) |
| A | [local-ai/tool-files.mjs](local-ai/tool-files.mjs) |
| A | [local-ai/tool-registry.mjs](local-ai/tool-registry.mjs) |
| A | [local-ai/tool-schemas.json](local-ai/tool-schemas.json) |
| A | [local-ai/verification/floorplan-acceptance-summary.json](local-ai/verification/floorplan-acceptance-summary.json) |
| A | [local-ai/web-chat-check.mjs](local-ai/web-chat-check.mjs) |
| A | [local-ai/web-final-check.mjs](local-ai/web-final-check.mjs) |
| A | [local-ai/web-furniture-check.mjs](local-ai/web-furniture-check.mjs) |
| A | [local-ai/web-stop-check.mjs](local-ai/web-stop-check.mjs) |
| M | [packages/core/src/schema/material.ts](packages/core/src/schema/material.ts) |
| M | [packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.test.tsx](packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.test.tsx) |
| M | [packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.tsx](packages/editor/src/components/editor-2d/renderers/floorplan-geometry-renderer.tsx) |
| M | [packages/editor/src/lib/model-export.ts](packages/editor/src/lib/model-export.ts) |
| M | [packages/mcp/src/tools/export-glb.ts](packages/mcp/src/tools/export-glb.ts) |
| M | [packages/mcp/src/tools/view-scene.ts](packages/mcp/src/tools/view-scene.ts) |
| M | [packages/nodes/src/item/floorplan.ts](packages/nodes/src/item/floorplan.ts) |
| M | [packages/nodes/src/item/plan-symbols.test.ts](packages/nodes/src/item/plan-symbols.test.ts) |
| M | [packages/viewer/src/lib/materials.test.ts](packages/viewer/src/lib/materials.test.ts) |
| M | [packages/viewer/src/lib/materials.ts](packages/viewer/src/lib/materials.ts) |
| A | [LOCAL-AI-INTEGRATION.md](LOCAL-AI-INTEGRATION.md) |
