# QUBIT

Enterprise Portfolio & Programme Management (PPM) platform for **Riverbank Group** and
**KCB Group**. Multitenant, tenant-isolated via Postgres Row-Level Security, with
per-tenant theming (KCB = green, Riverbank = red).

Read [`CLAUDE.md`](./CLAUDE.md) and [`docs/00-index.md`](./docs/00-index.md) before making
changes — they define the non-negotiable rules (multitenancy, security, audit) and the
milestone build plan this project follows.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · shadcn/ui ·
PostgreSQL 17 + Prisma · Auth.js (NextAuth v5) · Zod · TanStack Query · Recharts · Vitest ·
Playwright.

## Getting started

```bash
pnpm install

# start Postgres 17 locally (see docs/03-dependencies.md)
docker run --name qubit-pg -e POSTGRES_USER=qubit -e POSTGRES_PASSWORD=qubit \
  -e POSTGRES_DB=qubit -p 5432:5432 -d postgres:17

cp .env.example .env   # fill in DATABASE_URL / AUTH_SECRET

pnpm dev
```

## Common commands

```bash
pnpm dev                     # run dev server
pnpm build                   # production build
pnpm prisma:migrate          # apply schema changes
pnpm prisma:seed             # seed synthetic tenants/data
pnpm test                    # unit tests (Vitest)
pnpm test:e2e                # Playwright e2e
pnpm lint && pnpm typecheck  # quality gates (must pass before a milestone is "done")
```

## Project status

Milestone 0 (scaffold & tooling) is complete. See
[`docs/10-build-plan.md`](./docs/10-build-plan.md) for what's next.
