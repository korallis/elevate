# ADR 0005: Visualization Layer

Status: Accepted

## Context

We need expressive, performant visualizations with programmatic control for AI‑generated dashboards and manual authoring.

## Decision

- Use Vega‑Lite for declarative, compact chart specifications and rapid AI generation.
- Use Apache ECharts for rich interactivity, large data support, and advanced visuals where needed.
- Provide a unified dashboard spec that can target either engine behind the scenes.

## Consequences

- Flexibility to match use case complexity, while keeping a simple default path.
- Requires consistent theming and accessibility patterns across engines.

## Alternatives Considered

- Single‑engine approach (simpler, less flexibility for advanced needs).

## Follow‑ups

- Define dashboard schema (layout, filters, interactions) and mapping to Vega‑Lite/ECharts.
- Establish performance budget and lazy‑loading strategy.

