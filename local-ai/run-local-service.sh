#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$TASK_ROOT"
case "${1:-}" in
  editor) cd "$TASK_ROOT/editor-src/apps/editor"; exec "$LOCAL_BUN" run dev -- --hostname 127.0.0.1 --port 3002 ;;
  chat) exec "$LOCAL_NODE" "$TASK_ROOT/chat-server.mjs" ;;
  studio) exec "$LOCAL_NODE" "$TASK_ROOT/studio/server.mjs" ;;
  qwen) exec bash "$TASK_ROOT/qwen-server.sh" ;;
  *) exit 2 ;;
esac
