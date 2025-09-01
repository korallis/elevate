# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SME Analytics is a monorepo-based analytics platform built with a modern 2025 stack. It consists of multiple applications and shared packages for data analytics, ETL processing, and reporting.

## Tech Stack

- **Node.js**: >= 22 (Active LTS)
- **Package Manager**: pnpm 10.15.0 (via Corepack)
- **Monorepo**: Turbo 2.5.6 + pnpm workspaces
- **Frontend**: Next.js 15.5.2 + React 19.1.1 with Turbopack
- **Backend**: Hono framework with Node.js server
- **TypeScript**: 5.9.2 (strict mode required - no `any` types)
- **Styling**: Tailwind CSS 4.1.12 (`@tailwindcss/postcss`)
- **Linting**: ESLint 9 (flat config) + Prettier 3
- **Databases**: PostgreSQL (via Docker) + Snowflake
- **Caching**: Redis (via Docker)

## Common Commands

```bash
# Setup (first time only)
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm install

# Development
pnpm dev                          # Run all apps in dev mode via Turbo
pnpm --filter @sme/web dev       # Run web app only (Turbopack)
pnpm --filter @sme/api dev       # Run API server only
pnpm --filter @sme/exporter dev  # Run exporter only
pnpm --filter @sme/worker dev    # Run worker only

# Build
pnpm build                        # Build all apps
pnpm --filter @sme/web build     # Build web app with Turbopack

# Code Quality (MUST run after changes)
pnpm lint                         # Run ESLint across monorepo
pnpm typecheck                    # Run TypeScript checks
pnpm prettier --write .           # Format code

# Docker Services
docker-compose up -d              # Start PostgreSQL and Redis
docker-compose down              # Stop services
```

## Architecture

### Monorepo Structure

- **apps/**
  - `web/` - Next.js 15 frontend with React 19, uses Turbopack for fast builds
  - `api/` - Hono-based REST API server connecting to Snowflake and PostgreSQL
  - `exporter/` - Data export service
  - `worker/` - Background job processor

- **packages/**
  - `ui/` - Shared React components library
  - `schemas/` - Shared Zod schemas and TypeScript types
  - `db/` - Database utilities and connections

### Key API Endpoints (apps/api)

The API server provides endpoints for:

- `/snowflake/*` - Snowflake database operations (tables, schemas, columns)
- `/catalog/*` - Data catalog management and discovery
- `/etl/*` - ETL scheduling and streaming
- `/explore/*` - Query exploration
- `/governance/*` - PII tagging and data governance
- `/export/*` - Data export operations
- `/transform/*` - Data transformation aliases

### Database Configuration

- **PostgreSQL**: Local development database for catalog and schedules
  - Host: localhost:5432
  - Database/User/Password: sme
- **Snowflake**: Analytics data warehouse (configure via .env)
  - Requires account credentials in environment variables
  - Supports both password and key-pair authentication

- **Redis**: Caching layer on localhost:6379

## Development Workflow

1. Environment setup: Copy `.env.example` to `.env` and configure credentials
2. Start Docker services: `docker-compose up -d`
3. Install dependencies: `pnpm install`
4. Run development servers: `pnpm dev`
5. After making changes:
   - Run `pnpm lint` to check for linting issues
   - Run `pnpm typecheck` to verify TypeScript types
   - Run `pnpm prettier --write .` to format code

## Important Conventions

- **TypeScript Strict Mode**: All TypeScript code must adhere to strict mode. The `any` type is forbidden.
- **ESLint Flat Config**: Uses ESLint 9 with flat configuration at `eslint.config.mjs`
- **Tailwind v4**: Uses the new `@tailwindcss/postcss` package with PostCSS
- **Module Type**: API, exporter, and worker apps use ESM modules (`"type": "module"`)
- **Pre-commit Hooks**: Husky runs lint-staged for Prettier and ESLint on changed files
- **Turbo Caching**: Build outputs are cached in `dist/**` and `.next/**`

## Environment Variables

Required environment variables (see `.env.example`):

- Snowflake connection details (account, user, password/key, warehouse, role, database, schema)
- PostgreSQL connection (or use Docker defaults)
- `NEXT_PUBLIC_API_BASE`: API endpoint for frontend (default: http://localhost:3001)
- `BUDGET_CAPACITY`: Budget guardrails configuration

## Special Scripts

- `pnpm setup`: Materializes files from .md stubs if needed
- `pnpm mcp:test:serena`: Tests Serena MCP integration
