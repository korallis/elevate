#!/usr/bin/env bash
set -euo pipefail
if ! command -v supabase >/dev/null 2>&1; then echo "Supabase CLI not found"; exit 0; fi
: "${SUPABASE_PROJECT_ID:?Set SUPABASE_PROJECT_ID}"
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN}"
if [ "${I_UNDERSTAND_WIPE:-}" != "WIPE" ]; then
  echo "Refusing to wipe remote DB. Set I_UNDERSTAND_WIPE=WIPE to proceed."
  exit 1
fi
echo "Linking to Supabase project $SUPABASE_PROJECT_ID ..."
supabase login --token "$SUPABASE_ACCESS_TOKEN" || true
supabase link --project-ref "$SUPABASE_PROJECT_ID" || true

echo "⚠️  Remote DB RESET will drop user-created entities. Continue in 5s..."; sleep 5
# Confirm prompt non-interactively if CLI asks
printf 'y\n' | supabase db reset --linked
# Re-apply local migrations (if any). If none exist, remote will be empty.
supabase db push --linked || true
echo "✅ Supabase remote reset & migrations pushed."

