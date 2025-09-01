# ADR 0002: AI Strategy (Local‑first with Cloud Fallback)

Status: Accepted

## Context

We need AI to automate schema mapping, ETL planning, and dashboard generation. Privacy and cost control are priorities, with a desire to run locally when possible.

## Decision

- Primary: Local LLM via Ollama (Llama 3.1 8B/70B) for on‑device inference.
- Fallback: OpenAI Responses API, configurable per org policy and feature flag.
- Grounding: Always ground prompts in the semantic model, approved mappings, and data catalog to reduce hallucinations.
- Tooling: Implement constrained tool calling for agents (Schema Mapper, Pipeline Planner, Visualization Designer) with human‑in‑the‑loop approvals for changes to mappings/pipelines.

## Consequences

- Better privacy posture; predictable costs with local inference.
- Needs model management and hardware checks for acceptable latency.
- Cloud fallback enables higher‑quality models when allowed.

## Alternatives Considered

- Cloud‑only AI (simpler ops, higher cost/latency/privacy concerns).
- Self‑hosted GPU cluster (higher ops overhead).

## Follow‑ups

- Validate target hardware for Llama 3.1 model sizes; document latency/quality tradeoffs.
- Define prompt templates and evaluation criteria; add golden datasets for regression of mapping/insight quality.

