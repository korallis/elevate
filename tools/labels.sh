#!/usr/bin/env bash
set -euo pipefail
labels=( "feature:#1f883d" "bug:#d1242f" "docs:#0969da" "chore:#6e7781" "infra:#8250df" "blocked:#e11d48" )
for kv in "${labels[@]}"; do
  name="${kv%%:*}"; color="${kv##*:}"
  gh label create "$name" --color "${color#\#}" --description "" 2>/dev/null || gh label edit "$name" --color "${color#\#}"
done
