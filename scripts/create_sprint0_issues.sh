#!/usr/bin/env bash
set -euo pipefail

# Creates Sprint 0 issues in the target GitHub repo using GitHub CLI.
# Prereqs: gh CLI installed and authenticated (gh auth login)
# Usage: ./scripts/create_sprint0_issues.sh [owner/repo]

detect_repo() {
  if [ -n "${1:-}" ]; then
    echo "$1"
    return
  fi
  if git remote get-url origin >/dev/null 2>&1; then
    url=$(git remote get-url origin)
    if [[ "$url" =~ github.com[:/]+([^/]+)/([^/.]+) ]]; then
      echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
      return
    fi
  fi
  echo "" 
}

repo="$(detect_repo "${1:-}")"
if [ -z "$repo" ]; then
  echo "Usage: $0 <owner/repo> (or run inside a git repo with origin set)" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found. Install GitHub CLI and run 'gh auth login'." >&2
  exit 1
fi

echo "Target repository: $repo"

# Ensure labels exist (ignore errors if already exist)
labels=("sprint-0" "docs" "adr")
for l in "${labels[@]}"; do
  gh label create "$l" --color 1f883d --repo "$repo" >/dev/null 2>&1 || true
done

create_issue() {
  local title="$1"; shift
  local body="$1"; shift
  local labels_csv="$1"; shift
  echo "Creating: $title"
  gh issue create --repo "$repo" --title "$title" --body "$body" --label "$labels_csv" >/dev/null
}

# Issues derived from docs/sprint-0-backlog.md

create_issue "ADR: Architecture & Stack (0001)" \
"Decide core stack and confirm latest versions at scaffold time.\n\nAcceptance Criteria:\n- ADR 0001 committed with rationale and consequences.\n- Version confirmation checklist prepared (docs/version-checks.md)." \
"sprint-0,adr"

create_issue "ADR: AI Strategy (Local-first + OpenAI fallback) (0002)" \
"Define local LLM via Ollama; outline fallback to OpenAI; guardrails & grounding.\n\nAcceptance Criteria:\n- ADR 0002 committed with model choices and governance controls." \
"sprint-0,adr"

create_issue "ADR: Semantic Layer & Metrics (0003)" \
"Define semantic layer scope (entities, dims, facts, measures), storage format, and governance.\n\nAcceptance Criteria:\n- ADR 0003 committed; links to canonical model doc." \
"sprint-0,adr"

create_issue "ADR: Connectors & ETL (0004)" \
"Choose libraries (snowflake-sdk, jsforce, xero-node, Spendesk REST), incremental strategy, schedules.\n\nAcceptance Criteria:\n- ADR 0004 committed; security considerations for secrets." \
"sprint-0,adr"

create_issue "ADR: Visualization Layer (0005)" \
"Select Vega‑Lite and/or Apache ECharts; define when each is used.\n\nAcceptance Criteria:\n- ADR 0005 committed with UX and performance tradeoffs." \
"sprint-0,adr"

create_issue "ADR: Orchestration & Caching (0006)" \
"Decide queue vs Temporal for MVP; pre‑aggregations/caching plan.\n\nAcceptance Criteria:\n- ADR 0006 committed; MVP approach defined and reassessment checkpoint." \
"sprint-0,adr"

create_issue "ADR: Security, Tenancy, Governance (0007)" \
"RBAC model, RLS strategy, secrets management, audit logging.\n\nAcceptance Criteria:\n- ADR 0007 committed with initial policy set." \
"sprint-0,adr"

create_issue "ADR: DevOps, Repo, CI (0008)" \
"Git branching, PR/review rules, CI checks, conventions, codeowners.\n\nAcceptance Criteria:\n- ADR 0008 committed; initial CI plan documented." \
"sprint-0,adr"

create_issue "Architecture Overview Doc" \
"Draft high‑level component architecture.\n\nAcceptance Criteria:\n- docs/architecture.md completed and linked from docs/README.md." \
"sprint-0,docs"

create_issue "Canonical Data Model Doc" \
"Draft initial dimensions/facts and mapping guidance.\n\nAcceptance Criteria:\n- docs/canonical-data-model.md completed." \
"sprint-0,docs"

create_issue "Non‑Functional Requirements Doc" \
"Performance/availability/security/observability targets.\n\nAcceptance Criteria:\n- docs/non-functional-requirements.md completed." \
"sprint-0,docs"

create_issue "Security & Governance Doc" \
"Tenancy, RBAC, RLS, secrets, audit, compliance path.\n\nAcceptance Criteria:\n- docs/security-and-governance.md completed." \
"sprint-0,docs"

create_issue "Roadmap Doc" \
"Phased milestones from v0.1 to v1.0 with success criteria.\n\nAcceptance Criteria:\n- docs/roadmap.md completed." \
"sprint-0,docs"

create_issue "Version Check Plan" \
"Checklist and commands to confirm latest versions with MCP servers at scaffold time.\n\nAcceptance Criteria:\n- docs/version-checks.md completed." \
"sprint-0,docs"

create_issue "Repo Reset Plan" \
"Plan to empty/rebase repo when scaffolding is approved.\n\nAcceptance Criteria:\n- docs/repo-reset-plan.md completed." \
"sprint-0,docs"

echo "Sprint 0 issues created in $repo."

