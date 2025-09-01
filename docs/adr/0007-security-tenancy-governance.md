# ADR 0007: Security, Tenancy, Governance

Status: Accepted

## Context

Multi‑tenant analytics requires strict isolation, controlled access, and auditable governance over models, data, and outputs.

## Decision

- Multi‑tenant RBAC with roles: Org Admin, Division Admin, Analyst, Viewer.
- RLS policies defined at the semantic layer and enforced in query generation.
- Secrets vaulted; OAuth tokens refreshed with minimal scopes; audit all credential use.
- Versioning and approvals for semantic changes, mappings, and pipelines; lineage visible in UI.

## Consequences

- Strong governance and auditability similar to (or better than) Power BI workspaces/pipelines.
- Additional complexity in policy evaluation and management UI.

## Alternatives Considered

- Single‑tenant deployments per org (simpler, higher ops cost, poorer multi‑org visibility).

## Follow‑ups

- Define policy evaluation order and conflict resolution.
- Implement export controls and watermarking for sensitive reports.

