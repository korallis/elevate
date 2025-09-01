# Product Vision & Scope

## Vision
Build a modern, elegant, web‑only BI platform that fully replaces Power BI for our organization, with simpler operations and lower TCO. It automates data mapping, ETL, modeling, and dashboard creation with AI, while preserving full manual controls for expert users. It must be secure, multi‑tenant (organizations and divisions), and delightful to use on desktop and mobile.

## Primary Objectives
- Replace Power BI across core use cases without loss of capability.
- Native connectors for Snowflake, Salesforce, Xero and Spendesk.
- Automatic data mapping and ETL from the above sources into a canonical model.
- Automatic analytical dashboard generation from user input and/or templates.
- Intuitive manual workflows for data engineers/analysts to model, transform, and design dashboards.
- Simple sharing with users and departments; orgs self‑manage in an admin panel.
- Strict security: RLS/CLS, audit logs, SSO roadmap; multi‑tenant isolation.
- Built on the latest stable tooling (versions to be confirmed via MCP checks during scaffolding).

## Users & Personas
- Business user: consumes dashboards, asks questions in natural language, shares insights.
- Analyst: defines datasets/joins/measures, tunes AI outputs, builds dashboards.
- Data engineer: manages connectors, ETL jobs, quality checks, schema evolution.
- Org admin: manages organizations, divisions, users, roles, and governance.

## Key Differentiators vs. Power BI
- Web‑only UX: zero desktop dependency, no PBIX friction.
- Automated end‑to‑end setup: connectors → mapping → ETL → dashboards.
- Local‑first AI with privacy controls; optional OpenAI fallback for accuracy/coverage.
- Unified semantic/metrics layer usable by both AI and manual builders.
- Modern, responsive UX with consistent theming and accessible design components.

## Non‑Goals (Initial)
- 100% DAX function parity (we will provide alternatives and compatibility paths).
- Full PBIX import (we will focus on model/measure extraction via supported interfaces).
- On‑prem Windows gateway parity (we target cloud‑first with secure connectors).

## Success Metrics
- Time‑to‑first dashboard: < 30 minutes from first connector auth.
- AI adoption: > 50% of new dashboards started via AI assistant.
- Manual power user satisfaction (CSAT): ≥ 4.5/5.
- Cost: ≥ 40% lower monthly BI spend versus prior Power BI footprint.
- Reliability: ETL success rate ≥ 99%; dashboard p95 load < 2.5s (cached) / < 7s (warehouse live).
