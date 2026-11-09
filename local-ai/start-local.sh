#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$TASK_ROOT"
node "$TASK_ROOT/service-control.mjs" qwen
# Build the selected checkout, including semantic schemas and node definitions.
# TypeScript's incremental builds avoid stale dist after switching branches.
for package in mcp nodes viewer; do
  (cd "$TASK_ROOT/editor-src/packages/$package" && bun run build) > "$TASK_ROOT/$package-build.log" 2>&1
done
bash pascal.sh start --json > "$TASK_ROOT/pascal-start.json"
node "$TASK_ROOT/service-control.mjs" editor
node "$TASK_ROOT/service-control.mjs" chat
node "$TASK_ROOT/service-control.mjs" studio
printf '\n网页：http://127.0.0.1:3002\n打开项目后，点击左侧 Chat 或顶部 Studio · 本地。首次页面编译需要等待。\n'
