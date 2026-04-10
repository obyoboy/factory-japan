#!/usr/bin/env bash
# Wrapper script for the article pipeline (macOS / Linux)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_SCRIPT="$REPO_ROOT/scripts/run-pipeline.js"

if [ ! -f "$PIPELINE_SCRIPT" ]; then
  echo "ERROR: run-pipeline.js not found: $PIPELINE_SCRIPT" >&2
  exit 1
fi

RUN_MODE="single"
SKIP_BUILD_PUBLISHED=0
SKIP_IMAGE_FETCH=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --run-mode)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --run-mode requires a value (single|until-claude-limit)." >&2
        exit 1
      fi
      RUN_MODE="$2"
      shift 2
      ;;
    --until-claude-limit)
      RUN_MODE="until-claude-limit"
      shift
      ;;
    --skip-build-published)
      SKIP_BUILD_PUBLISHED=1
      shift
      ;;
    --skip-image-fetch)
      SKIP_IMAGE_FETCH=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$RUN_MODE" != "single" ] && [ "$RUN_MODE" != "until-claude-limit" ]; then
  echo "ERROR: run mode must be single or until-claude-limit." >&2
  exit 1
fi

echo ""
echo "=== Work in Japan Factory Guide | Article Pipeline ==="
echo "Run mode: $RUN_MODE"
echo ""

cd "$REPO_ROOT"

ARGS=(--generate-with-claude --run-mode "$RUN_MODE")

if [ "$SKIP_BUILD_PUBLISHED" -eq 1 ]; then
  ARGS+=(--skip-build-published)
fi

if [ "$SKIP_IMAGE_FETCH" -eq 1 ]; then
  ARGS+=(--skip-image-fetch)
else
  ARGS+=(--fetch-image-with-pexels)
fi

node "$PIPELINE_SCRIPT" "${ARGS[@]}"
