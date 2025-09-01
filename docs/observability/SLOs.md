# Observability SLOs and Alerting

This document defines Elev8 service SLOs, supporting metrics, and alerting rules.

Service scope: API (`@sme/api`) and Exporter flows (PDF/PNG/CSV/XLSX).

Objectives

- API latency: Users receive fast responses for common operations.
- Export reliability: Scheduled and on-demand exports succeed consistently.

SLOs (28-day window)

- API latency (request path-level, excluding background jobs):
  - p95 latency < 0.4s for cached endpoints
  - p95 latency < 2.0s for direct warehouse endpoints
- Export success rate:
  - Success ratio ≥ 99.0% for (pdf|png|csv|xlsx) combined, excluding client cancellations

SLIs & Metrics

- HTTP latency histogram: `elev8_http_request_duration_seconds{method, path, status}`
- HTTP request count: `elev8_http_requests_total{method, path, status}`
- Export counters:
  - Success: `elev8_export_success_total{format}`
  - Failure: `elev8_export_failure_total{format}`

Dashboards

- API latency percentiles (p50/p95/p99) by path and status
- Error rates by status code (5xx)
- Export success ratio by format

Alerting (examples)

1) API latency burn (p95)

```
latency_p95_5m = histogram_quantile(0.95,
  sum(rate(elev8_http_request_duration_seconds_bucket[5m])) by (le, path)
)
```

- Warning: `latency_p95_5m{path!~".*/metrics|/health"} > 0.4` for cached paths (label list configurable)
- Critical: `latency_p95_5m{path!~".*/metrics|/health"} > 2.0` for direct query paths

2) Export reliability

```
export_failure_rate_15m = sum(rate(elev8_export_failure_total[15m]))
  /
  clamp_min(sum(rate(elev8_export_success_total[15m])) + sum(rate(elev8_export_failure_total[15m])), 1)
```

- Warning: `export_failure_rate_15m > 0.02` (2% over 15m)
- Critical: `export_failure_rate_15m > 0.05` (5% over 15m)

Runbook Links

- Confirm upstream dependencies (Snowflake, Redis, Postgres) health
- Check recent deploys and error logs (`/logs`, tracing spans)
- Review cache hit/miss (optional metric), and invalidate hot keys if necessary
- For exports, verify web rendering health and recent template changes

