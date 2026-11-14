#!/usr/bin/env bash
# run-variant.sh <label> <model> <split|whole> [repeat=3] [extra run.ts args]
set -euo pipefail
S="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSX="$HOME/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/cli.mjs"
LABEL="$1"; MODEL="$2"; DECOMP="$3"; REPEAT="${4:-3}"; shift 3; [ $# -gt 0 ] && shift
mkdir -p "$S/runs/$LABEL"
cd "$S/wt"
set +e
BAKE_DECOMP="$DECOMP" BAKE_PARSE_MODEL="$MODEL" BAKE_MATCH_MODEL="$MODEL" BAKE_LABEL="$LABEL" BAKE_RUNS_DIR="$S/runs" \
  node "$TSX" scripts/eval/run.ts --dataset=dataset-v3.json --search=fts --repeat="$REPEAT" "$@" 2>&1 | tee "$S/runs/$LABEL/run.log"
rc=${PIPESTATUS[0]}
exit "$rc"
