#!/usr/bin/env bash
# Determinism + expected-event report for every fixture.
# Writes one <id>.txt per fixture into the given dir (default: expected/).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/expected}"
mkdir -p "$OUT"
printf '%-32s %-14s %s\n' FIXTURE DETERMINISTIC DETAIL
for f in "$HERE"/fixtures/f*.json; do
  id=$(basename "$f" .json)
  node "$HERE/sim_notes.js" "$f" > "$OUT/$id.txt" 2>&1
  line=$(sed -n 3p "$OUT/$id.txt")
  det=$(printf '%s' "$line" | sed -n 's/.*deterministic=\([a-z]*\).*/\1/p')
  printf '%-32s %-14s %s\n' "$id" "${det:-ERR}" "$line"
done
