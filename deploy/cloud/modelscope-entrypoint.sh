#!/bin/sh
set -eu
test "${PASCAL_DATA_DIR:-}" = /mnt/workspace/pascal
umask 077
mkdir -p /mnt/workspace/pascal
chown node:node /mnt/workspace/pascal
exec su-exec node node deploy/cloud/runtime.mjs
