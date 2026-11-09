#!/bin/bash
set -euo pipefail
QWEN_WORKSPACE="/Users/Bill_Admin/Research/nnndl/try-mlx-vlm"
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
exec "$QWEN_WORKSPACE/.venv-qwen38/bin/python" -m mlx_vlm.server \
  --host 127.0.0.1 --port 18080 \
  --model mlx-community/Qwen3.8-27B-8bit \
  --draft-model mlx-community/Qwen3.8-27B-MTP-8bit --draft-kind mtp \
  --max-num-seqs 1 --max-tokens 2048 "$@"
