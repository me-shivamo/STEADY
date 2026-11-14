#!/usr/bin/env bash
# Sequential A/B: checks the eval key budget before each run; stops if < $0.40 or on key-limit exit 3.
S="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$S/runs"
for spec in "mini-split openai/gpt-4o-mini split" "mini-whole openai/gpt-4o-mini whole" "luna-split openai/gpt-6-luna split" "luna-whole openai/gpt-6-luna whole"; do
  set -- $spec
  if [ -f "$S/runs/$1/summary.json" ]; then echo "skip $1 (done)"; continue; fi
  ks=$(node "$S/key-status.mjs"); echo "$ks" > "$S/runs/key-before-$1.json"
  rem=$(echo "$ks" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.limit_remaining??-1)})")
  echo "[$(date +%T)] before $1: remaining=$rem"
  if node -e "process.exit(Number('$rem') < 0.40 ? 0 : 1)"; then echo "STOP: key remaining $rem < 0.40 before $1"; exit 4; fi
  "$S/run-variant-split.sh" "$1" "$2" "$3" 3 > "$S/runs/$1.stdout" 2>&1
  rc=$?; echo "[$(date +%T)] $1 exit=$rc"
  if [ $rc -eq 3 ]; then echo "STOP: key limit / fatal HTTP during $1"; exit 3; fi
  if [ $rc -ne 0 ]; then echo "STOP: $1 failed rc=$rc"; exit $rc; fi
  grep "^BAKE $1" "$S/runs/$1.stdout"
done
node "$S/key-status.mjs" > "$S/runs/key-after-all.json"; echo "ALL DONE"
