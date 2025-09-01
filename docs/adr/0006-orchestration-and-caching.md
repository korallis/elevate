# ADR 0006: Orchestration & Caching

Status: Accepted

## Context

ETL processes, schedules, and retries need reliable orchestration. Dashboards require low latency via caching and pre‑aggregations.

## Decision

- MVP: Queue‑based orchestration (e.g., BullMQ/Redis) with idempotent job handlers, retries, and DLQs.
- Reassess adopting Temporal after MVP when workflows and SLAs mature.
- Caching: Use pre‑aggregations/materialized views for common queries; short TTL result cache for ad‑hoc queries.

## Consequences

- Faster delivery with a simpler stack; future path to Temporal for complex workflows.
- Operational responsibility for Redis and cache invalidation policy.

## Alternatives Considered

- Temporal from day one (powerful but heavier operationally).

## Follow‑ups

- Define cache keys, TTLs, and invalidation tied to refresh schedules.
- Add query tagging and observability for cache hit/miss analysis.

