#!/usr/bin/env bash
set -euo pipefail
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -f required_status_checks.strict=true \
  -F required_status_checks.contexts[]="CI" \
  -F enforce_admins=true \
  -F required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' \
  -F restrictions='null' \
  -H "Accept: application/vnd.github+json"
