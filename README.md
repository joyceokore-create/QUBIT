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

Sign in at `/login` with just an email + password (see `prisma/seed.ts` for seeded users) —
no organization picker; the tenant is resolved from the email's domain
(`kcb.example.invalid` → KCB Group, `riverbank.solutions` / `riverbank.example.invalid` →
Riverbank Group). Try `amina.ndungu@kcb.example.invalid` or `joyce.okore@riverbank.solutions`,
password `Passw0rd!23`. That demo password is local-dev/seed-only, shared by every seeded
user; it is not a real secret.

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

Milestones 1–4 (database/RLS, auth/RBAC/audit, app shell/theming, Group Overview
dashboard) are complete, plus an unplanned **Admin & IAM v1** pass:

- **Group Overview dashboard** (`/dashboard`): KPI strip, portfolio × subsidiary health
  map (click a cell to drill into that portfolio filtered to a subsidiary, click a
  portfolio name to drill straight in), portfolio and standalone card grids, and live
  escalations/upcoming-milestones feeds — all computed from real seeded data via
  `src/server/dashboard.ts`, matching `docs/09-ui-spec.md`'s derived-value rules exactly
  (project progress = avg of subsidiary progress, heatmap status = worst of
  {Overdue, At Risk, On Track}, Planning falls through to On Track). Verified both
  tenants render correct, isolated numbers. Standalone card click-through (slide panel)
  is deferred to the portfolio/project drill-down milestone.
- Two schema gaps surfaced and fixed while building this: `Milestone` had no due date
  (needed for "Upcoming Milestones"), and the design system doc specified an On Track
  pill background that was never added as a token. A handful of real seeded milestones
  were backfilled with dates, and seeded risks/issues got backdated `createdAt`s, so the
  feeds show a realistic spread instead of everything reading "just now" after a fresh seed.

- Auth.js v5 with a Credentials provider — just email + password + optional TOTP code, no
  organization picker. The tenant is resolved from the email's domain
  (`Tenant.domains`, `src/lib/tenant-domain.ts`); the login form calls
  `/api/auth/resolve-org` as the user types to confirm "Signing in to KCB Group" before
  submit. JWT sessions (24h), bcrypt password hashing with an 8-char minimum and no reuse
  of the last 3 passwords, and per-key login rate limiting/lockout.
- TOTP MFA enrolment (`/settings/mfa`, also reachable from the account menu) with the
  secret encrypted at rest.
- `middleware.ts` gates every route except `/login`; `getTenantContext()` and `can()` give
  route handlers and server components a session-derived tenant + permission check.
- Every mutation helper (`audit()`) writes an `audit_log` row atomically with its mutation.
- App shell: sticky Topbar (logo, nav tabs, TenantChip, account menu) and a permission-gated
  Sidebar — every group hides itself if the signed-in role lacks the permission for it.
  Per-tenant brand tokens (`--brand`/`--brand-light`): KCB renders green, Riverbank
  renders red, RAG status colours stay semantic either way.
- **Administration** (`/admin/users`, `/admin/roles`, `/admin/audit`, gated on
  `iam:manage`): create users with roles, edit roles (diffed and audited as
  `role_grant`/`role_revoke`), suspend/reactivate, and soft-delete (PII-scrubbing, per
  FR-IAM-01). A browsable permission catalogue and an IAM audit log viewer round it out.
  `PlatformSuperAdmin` was broadened to read-only (`*:read` + `tenant:switch`) since a role
  with no visibility can't oversee anything — the actual tenant-switch mechanism itself is
  still a follow-up. Departments, CSV bulk upload, and custom role creation are explicitly
  deferred (see `docs/06-api-spec.md`'s Administration section).
- Nav destinations not yet built (portfolio/subsidiary detail, standalone, RAID) render a
  `ComingSoon` placeholder naming the milestone that lands them, instead of a dead link.
- `tests/rls/` and `tests/unit/` cover cross-tenant isolation, audit-row correctness,
  role-by-role permission checks, and the full admin user lifecycle (create → role
  diff → suspend → soft-delete), including self-lockout guards.

See [`docs/10-build-plan.md`](./docs/10-build-plan.md) for what's next (Milestone 5:
portfolio, programme & project drill-down).

`dashboard:read` (needed for `/dashboard`, everyone's post-login landing page) is now
granted to every role except `DepartmentHead`, a dynamic approval-only role — see
`docs/07-auth-rbac.md`'s Milestone 4 update note.
