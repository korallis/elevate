#!/usr/bin/env bash
set -euo pipefail
if ! command -v vercel >/dev/null 2>&1; then echo "Vercel CLI not found"; exit 0; fi
: "${VERCEL_TOKEN:?Set VERCEL_TOKEN}"
: "${VERCEL_ORG_ID:?Set VERCEL_ORG_ID}"
: "${VERCEL_PROJECT_ID:?Set VERCEL_PROJECT_ID}"

mkdir -p .vercel
cat > .vercel/project.json <<JSON
{ "orgId": "$VERCEL_ORG_ID", "projectId": "$VERCEL_PROJECT_ID" }
JSON

# 1) Remove env vars defined in .env.example (skip Snowflake + DB/Redis secrets by default)
if [ -f ".env.example" ]; then
  while IFS='=' read -r NAME VALUE; do
    [[ -z "$NAME" || "$NAME" =~ ^# ]] && continue
    # Skip local-only or sensitive secrets; manage those via Vercel dashboard or repo secrets
    if [[ "$NAME" =~ ^SNOWFLAKE_|^PGPASSWORD$|^DATABASE_URL$|^REDIS_URL$ ]]; then continue; fi
    for ENV in production preview development; do
      vercel env rm "$NAME" "$ENV" --yes --token "$VERCEL_TOKEN" >/dev/null 2>&1 || true
    done
  done < <(grep -E '^[A-Z0-9_]+=' .env.example)
fi

# 2) Purge build cache
vercel cache purge --yes --token "$VERCEL_TOKEN"

# 3) (Optional) Remove PREVIEW deployments (keeps production); uncomment to use.
# vercel list --environment=preview --token "$VERCEL_TOKEN" | awk '/vercel\.app/ {print $1}' | while read -r DEP; do
#   vercel remove "$DEP" --yes --token "$VERCEL_TOKEN" || true
# done

echo "✅ Vercel env cleaned (from .env.example), cache purged."

