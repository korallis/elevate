# ADR 0003: Semantic Layer & Metrics

Status: Accepted

## Context

Replacing Power BI requires a governed semantic model: central definitions for dimensions, facts, and measures used by both manual and AI‑assisted workflows, with RLS and versioning.

## Decision

- Store semantic definitions (entities, dims, facts, measures, relationships, policies) in the metadata DB with versioning and changelogs.
- Provide export/import as YAML for review and migration.
- Enforce RLS policies within the semantic layer and push down filters into queries.
- Expose a typed API for the AI layer and visualization builder to reference governed metrics.

## Consequences

- Single source of truth for metrics promotes consistency across dashboards and AI outputs.
- Versioned changes support approvals and rollbacks.

## Alternatives Considered

- File‑only YAML (simple but harder to manage multi‑tenant governance).
- Tool‑specific models (locks us to a single viz engine).

## Follow‑ups

- Finalize initial entity/measure set (see canonical model doc).
- Define migration strategy when schema or measure logic evolves.

