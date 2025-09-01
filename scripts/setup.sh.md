# Path: scripts/setup.sh

````bash
#!/usr/bin/env bash
set -euo pipefail

# Materialize files from *.md stubs that contain:
#   "# Path: <target>" header and a fenced code block with content.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Materializing files from .md stubs…"
count=0

running_script_abs="$(cd "$ROOT_DIR" && python3 -c 'import os,sys;print(os.path.abspath(sys.argv[1]))' "${BASH_SOURCE[0]#./}")" 2>/dev/null || running_script_abs="${BASH_SOURCE[0]}"

while IFS= read -r -d '' mdfile; do
  header_line=$(grep -m1 '^# Path: ' "$mdfile" || true)
  [[ -z "$header_line" ]] && continue

  rel_target="$(printf "%s" "$header_line" | sed 's/^# Path: //')"
  target="$ROOT_DIR/$rel_target"

  # Avoid self-overwrite while running
  if [[ -n "$running_script_abs" ]] && [[ "$(cd "$ROOT_DIR" && python3 - <<PY 2>/dev/null
import os,sys
print(os.path.abspath(sys.argv[1]))
PY
"${rel_target#./}")" == "$running_script_abs" ]]; then
    echo "Skipping $rel_target (currently running)"
    continue
  fi

  mkdir -p "$(dirname "$target")"
  awk 'BEGIN{f=0} /^```/{if(f==0){f=1; next} else {exit}} f{print}' "$mdfile" > "$target"
  case "$target" in
    *.sh) chmod +x "$target";;
  esac
  echo "Wrote $rel_target"
  count=$((count+1))
done < <(find "$ROOT_DIR" -type f -name "*.md" -not -path "*/.git/*" -not -path "*/node_modules/*" -print0)

echo "Materialized $count files."

if [[ -f "$ROOT_DIR/package.json" ]]; then
  echo "Installing root dev dependencies with pnpm (if available)…"
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && pnpm install)
  elif command -v corepack >/dev/null 2>&1; then
    corepack enable pnpm
    (cd "$ROOT_DIR" && pnpm install)
  else
    echo "pnpm not found and corepack unavailable; skipping install."
  fi
fi

echo "Done."

````
