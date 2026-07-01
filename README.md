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

# start Postgres 17 locally — via Docker (see docs/03-dependencies.md) ...
docker run --name qubit-pg -e POSTGRES_USER=qubit -e POSTGRES_PASSWORD=qubit \
  -e POSTGRES_DB=qubit -p 5432:5432 -d postgres:17

# ... or against an existing local Postgres 17 (e.g. Postgres.app), create the app role/db:
#   CREATE ROLE qubit LOGIN PASSWORD 'qubit';
#   CREATE DATABASE qubit OWNER qubit;
# `prisma migrate dev` also needs the role to be able to create its shadow DB locally:
#   ALTER ROLE qubit CREATEDB;   -- local dev only; not needed for `prisma migrate deploy`

cp .env.example .env   # fill in DATABASE_URL / AUTH_SECRET / MFA_ENCRYPTION_KEY

pnpm prisma:migrate    # applies prisma/schema.prisma + prisma/rls.sql
pnpm prisma:seed       # seeds the KCB and Riverbank tenants

pnpm dev
```

Sign in at `/login` with any seeded user (see `prisma/seed.ts`) — organization **KCB Group**
or **Riverbank Group**, e.g. `amina.ndungu@example.invalid`, password `Passw0rd!23`. That
demo password is local-dev/seed-only, shared by every seeded user; it is not a real secret.

## Common commands

```bash
pnpm dev                     # run dev server
pnpm build                   # production build
pnpm prisma:migrate          # apply schema changes
pnpm prisma:seed             # seed synthetic tenants/data
pnpm test                    # unit + RLS isolation tests (Vitest) — needs a migrated, seeded DB
pnpm test:e2e                # Playwright e2e
pnpm lint && pnpm typecheck  # quality gates (must pass before a milestone is "done")
```

## Project status

Milestone 2 (auth, RBAC & audit) is complete, on top of Milestone 1 (database, Prisma &
RLS):

- Auth.js v5 with a Credentials provider (organization + email + password + optional TOTP
  code), JWT sessions (24h), bcrypt password hashing with an 8-char minimum and no reuse of
  the last 3 passwords, and per-key login rate limiting/lockout.
- TOTP MFA enrolment (`/settings/mfa`) with the secret encrypted at rest.
- `middleware.ts` gates every route except `/login`; `getTenantContext()` and `can()` give
  route handlers and server components a session-derived tenant + permission check.
- Every mutation helper (`audit()`) writes an `audit_log` row atomically with its mutation.
- `tests/rls/` and `tests/unit/` cover cross-tenant isolation, audit-row correctness, and
  role-by-role permission checks.

See [`docs/10-build-plan.md`](./docs/10-build-plan.md) for what's next (Milestone 3: app
shell & per-tenant theming).
