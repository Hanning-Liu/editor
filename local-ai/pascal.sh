#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export PASCAL_HOME="$TASK_ROOT/pascal-home"
exec "$TASK_ROOT/node_modules/.bin/pascal" "$@"
