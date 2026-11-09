#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$TASK_ROOT"
node "$TASK_ROOT/service-control.mjs" qwen
# The Chat MCP host uses the checked-out packages, including its renderer contract.
if [ ! -f "$TASK_ROOT/editor-src/packages/mcp/dist/server.js" ] || \
   [ "$TASK_ROOT/editor-src/packages/core/src/schema/material.ts" -nt "$TASK_ROOT/editor-src/packages/core/dist/schema/material.js" ] || \
   [ "$TASK_ROOT/editor-src/packages/mcp/src/tools/export-glb.ts" -nt "$TASK_ROOT/editor-src/packages/mcp/dist/tools/export-glb.js" ] || \
   [ "$TASK_ROOT/editor-src/packages/mcp/src/tools/view-scene.ts" -nt "$TASK_ROOT/editor-src/packages/mcp/dist/tools/view-scene.js" ]; then
  (cd "$TASK_ROOT/editor-src/packages/mcp" && bun run build) > "$TASK_ROOT/mcp-build.log" 2>&1
fi
if [ ! -f "$TASK_ROOT/editor-src/packages/viewer/dist/lib/materials.js" ] || \
   [ "$TASK_ROOT/editor-src/packages/viewer/src/lib/materials.ts" -nt "$TASK_ROOT/editor-src/packages/viewer/dist/lib/materials.js" ]; then
  (cd "$TASK_ROOT/editor-src/packages/viewer" && bun run build) > "$TASK_ROOT/viewer-build.log" 2>&1
fi
bash pascal.sh start --json > "$TASK_ROOT/pascal-start.json"
node "$TASK_ROOT/service-control.mjs" editor
node "$TASK_ROOT/service-control.mjs" chat
node "$TASK_ROOT/service-control.mjs" studio
printf '\n网页：http://127.0.0.1:3002\n打开项目后，点击左侧 Chat 或顶部 Studio · 本地。首次页面编译需要等待。\n'
