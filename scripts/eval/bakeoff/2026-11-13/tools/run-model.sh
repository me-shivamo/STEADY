#!/usr/bin/env bash
# Model bake-off: run the in-process eval (parse -> resolveFoods, fts search,
# memory off, persist false) with a chosen model for each LLM call.
#
#   run-model.sh <label> <parse_model> <match_model> [repeat=3] [extra run.ts args...]
#
# e.g.
#   run-model.sh base-4o-mini openai/gpt-4o-mini openai/gpt-4o-mini 3
#   BAKE_MATCH_EXTRA='{"reasoning":{"effort":"low"}}' \
#     run-model.sh g5mini-low openai/gpt-5-mini openai/gpt-5-mini 3
#   run-model.sh smoke openai/gpt-4o-mini openai/gpt-4o-mini 1 --ids=i01,i02
#
# Optional env:
#   BAKE_PARSE_EXTRA / BAKE_MATCH_EXTRA  JSON merged into the request body (null deletes a key)
#   BAKE_DATASET   default dataset-v3.json (dataset-v4 is refused: held out)
#   BAKE_FORCE=1   overwrite an existing runs/<label>/
#
# Output: runs/<label>/{calls.jsonl, results.json, summary.json, run.log}
# Exit 3 = stopped on a key-limit / 402 / 403 / repeated HTTP errors. Do not loop on it.
set -euo pipefail

BAKE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$BAKE/wt"
RUNS="${BAKE_RUNS_DIR:-$BAKE/runs}"
TSX="$HOME/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/cli.mjs"

if [ $# -lt 3 ]; then
  sed -n '2,20p' "$0"; exit 1
fi
LABEL="$1"; PARSE="$2"; MATCH="$3"; REPEAT="${4:-3}"
shift 3; [ $# -gt 0 ] && shift
DATASET="${BAKE_DATASET:-dataset-v3.json}"

if [ ! -f "$TSX" ]; then echo "cached tsx not found at $TSX" >&2; exit 1; fi
if [ -e "$RUNS/$LABEL/calls.jsonl" ] && [ "${BAKE_FORCE:-}" != "1" ]; then
  echo "runs/$LABEL already has a run — pick a new label or BAKE_FORCE=1" >&2; exit 1
fi
mkdir -p "$RUNS/$LABEL"

cd "$WT"
set +e
BAKE_PARSE_MODEL="$PARSE" BAKE_MATCH_MODEL="$MATCH" BAKE_LABEL="$LABEL" BAKE_RUNS_DIR="$RUNS" \
  node "$TSX" scripts/eval/run.ts --dataset="$DATASET" --search=fts --repeat="$REPEAT" "$@" \
  2>&1 | tee "$RUNS/$LABEL/run.log"
rc=${PIPESTATUS[0]}
set -e
exit "$rc"
