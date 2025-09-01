# Sprint 0 Backlog (Issues to Create)

Create these as GitHub issues with labels: `sprint-0`, `docs`, `adr` (where applicable).

---

## 1) ADR: Architecture & Stack
- Description: Decide core stack (Next.js, React, Node, Postgres, Snowflake, Tailwind, shadcn/ui) and confirm at scaffold time with MCP servers.
- Acceptance Criteria:
  - ADR 0001 committed with rationale, consequences, and follow‑ups.
  - Version confirmation checklist prepared (docs/version-checks.md).
- Size: M  | Dependencies: none

## 2) ADR: AI Strategy (Local‑first + OpenAI fallback)
- Description: Define local LLM via Ollama; outline fallback to OpenAI; guardrails & grounding.
- Acceptance Criteria:
  - ADR 0002 committed with model choices, prompts, governance controls.
- Size: M  | Dependencies: #1

## 3) ADR: Semantic Layer & Metrics
- Description: Define semantic layer scope (entities, dims, facts, measures), storage format, and governance.
- Acceptance Criteria:
  - ADR 0003 committed; links to canonical model doc.
- Size: M  | Dependencies: #1

## 4) ADR: Connectors & ETL
- Description: Choose libraries (snowflake-sdk, jsforce, xero-node, Spendesk REST), incremental strategy, schedules.
- Acceptance Criteria:
  - ADR 0004 committed; security considerations for secrets.
- Size: M  | Dependencies: #1

## 5) ADR: Visualization Layer
- Description: Select Vega‑Lite and/or Apache ECharts; define when each is used.
- Acceptance Criteria:
  - ADR 0005 committed with UX and performance tradeoffs.
- Size: S  | Dependencies: #1

## 6) ADR: Orchestration & Caching
- Description: Decide queue vs Temporal for MVP; pre‑aggregations/caching plan.
- Acceptance Criteria:
  - ADR 0006 committed; MVP approach defined and reassessment checkpoint.
- Size: M  | Dependencies: #1

## 7) ADR: Security, Tenancy, Governance
- Description: RBAC model, RLS strategy, secrets management, audit logging.
- Acceptance Criteria:
  - ADR 0007 committed with initial policy set.
- Size: M  | Dependencies: #1

## 8) ADR: DevOps, Repo, CI
- Description: Git branching, PR/review rules, CI checks, conventions, codeowners.
- Acceptance Criteria:
  - ADR 0008 committed; initial CI plan documented.
- Size: S  | Dependencies: #1

## 9) Architecture Overview Doc
- Description: Draft high‑level component architecture.
- Acceptance Criteria:
  - docs/architecture.md completed and linked from docs/README.md.
- Size: S  | Dependencies: #1

## 10) Canonical Data Model Doc
- Description: Draft initial dimensions/facts and mappings guidance.
- Acceptance Criteria:
  - docs/canonical-data-model.md completed.
- Size: M  | Dependencies: #3

## 11) Non‑Functional Requirements Doc
- Description: Performance/availability/security/observability targets.
- Acceptance Criteria:
  - docs/non-functional-requirements.md completed.
- Size: S  | Dependencies: none

## 12) Security & Governance Doc
- Description: Tenancy, RBAC, RLS, secrets, audit, compliance path.
- Acceptance Criteria:
  - docs/security-and-governance.md completed.
- Size: S  | Dependencies: #7

## 13) Roadmap Doc
- Description: Phased milestones from v0.1 to v1.0 with success criteria.
- Acceptance Criteria:
  - docs/roadmap.md completed.
- Size: S  | Dependencies: none

## 14) Version Check Plan
- Description: Checklist and commands to confirm latest versions with MCP servers at scaffold time.
- Acceptance Criteria:
  - docs/version-checks.md completed.
- Size: S  | Dependencies: #1

## 15) Repo Reset Plan
- Description: Plan to empty/rebase repo when scaffolding is approved.
- Acceptance Criteria:
  - docs/repo-reset-plan.md completed.
- Size: S  | Dependencies: none

