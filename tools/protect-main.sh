#!/usr/bin/env bash
set -euo pipefail
# Update branch protection for main: no code owner approval, 0 approvals, no required checks
# Requires: gh auth with repo admin rights
JSON_BODY='{
  "required_status_checks": { "strict": false, "contexts": [] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null
}'
echo "$JSON_BODY" | gh api -X PUT repos/:owner/:repo/branches/main/protection --input - -H "Accept: application/vnd.github+json"
echo "✅ Updated branch protection: no code owner or approvals required."
