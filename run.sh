#!/usr/bin/env bash
# run.sh — ワンコマンド全自動実行（Mac / Linux）
# 使い方: bash run.sh
# 依存  : node (Node.js), claude (Claude Code CLI)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_SCRIPT="$REPO_ROOT/scripts/run-pipeline.js"

if [ ! -f "$PIPELINE_SCRIPT" ]; then
  echo "ERROR: run-pipeline.js が見つかりません: $PIPELINE_SCRIPT" >&2
  exit 1
fi

echo ""
echo "=== Work in Japan Factory Guide — Article Pipeline ==="
echo "Mode: 全自動（トピック選択 → Claude生成 → HTML出力 → git push）"
echo ""

cd "$REPO_ROOT"

ARGS="--generate-with-claude"

# --skip-build-published フラグを引数で渡せるようにする
for arg in "$@"; do
  case "$arg" in
    --skip-build-published) ARGS="$ARGS --skip-build-published" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

node "$PIPELINE_SCRIPT" $ARGS
