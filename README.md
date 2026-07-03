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

Milestones 1–6 (database/RLS, auth/RBAC/audit, app shell/theming, Group Overview
dashboard, portfolio/programme/project drill-down, subsidiary view) are complete, plus two
unplanned passes, **Admin & IAM v1** and **Department / org structure**:

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
  still a follow-up. CSV bulk upload and custom role creation are explicitly deferred (see
  `docs/06-api-spec.md`'s Administration section).
- **Department / org structure** (`/admin/departments`, gated on the same `iam:manage`
  permission): hierarchical departments (self-referential `parentId`, cycle-checked on
  every update), an optional link to an `OrgUnit` so KCB can model per-country departments
  while Riverbank leaves it unset, and an informational `headUserId` that does **not**
  grant the unrelated `DepartmentHead` RBAC role. A user's department + manager (also
  self-referential — `User.managerId`) are assigned from `/admin/users`. Ships with **zero
  seeded rows** — real structure is entered by hand (CSV bulk import is a tracked
  follow-up, not built now), consistent with CLAUDE.md's no-real-PII rule. Delete is
  guarded against departments that still have children or member users; soft-deleting a
  user nulls out any dangling `managerId`/`headUserId` references to them.
- **Portfolio, programme & project drill-down** (`src/server/projects.ts`,
  `/api/portfolios/:id`, `/api/programmes/:id`, `/api/projects`, `/api/projects/:id`):
  portfolio detail page (header stats, programme cards, standalone-in-portfolio grid,
  `?sub=` heatmap-cell deep-link), and a reusable SlidePanel (project + programme
  variants) driven by React Context so any card/row across the app can open the same
  panel — Progress-by-Subsidiary bars and the full Milestone Matrix render inside it.
  Project create (scoped to a portfolio, optional programme) and edit
  (status/priority/due date/budget — Project has no `owner` field, a pre-existing
  doc/schema mismatch) are both permission-gated and audited with before/after
  snapshots. Full drill path Group Overview → Portfolio → Programme → Project panel
  verified end-to-end for both tenants, including cross-tenant isolation (a KCB session
  gets `404` on a Riverbank project id) and the edit audit trail.
- Riverbank's 25 standalone projects are real business data imported from
  `docs/Riverbank Projects.docx` (names, descriptions, per-stage progress); team member
  names were anonymized to generic role labels (`Project Lead`, `Contributor`) per
  CLAUDE.md's no-real-PII rule — never real employee names in seed data.
- **Subsidiary view** (`/subsidiaries/:orgUnitId`, `src/server/subsidiaries.ts`,
  `/api/subsidiaries/:orgUnitId/projects`): KPI strip (Total Items/On Track/At Risk/Overdue)
  scoped to that org unit, and a filterable project table (status chips + client-side
  search) showing each project's status/progress **for that subsidiary specifically**
  (from `ProjectOrgStatus`, not the project's overall rollup), with pips highlighting the
  current org unit and a row click opening the shared project SlidePanel. The heatmap
  cell's `?sub=` deep-link already correctly targets the portfolio view (Milestone 5,
  per `docs/09-ui-spec.md`'s Screen 1/2 design) — the sidebar's Subsidiaries group is this
  page's only entry point, by org unit id.
- Nav destinations not yet built (standalone, RAID) render a `ComingSoon` placeholder
  naming the milestone that lands them, instead of a dead link.
- `tests/rls/` and `tests/unit/` cover cross-tenant isolation, audit-row correctness,
  role-by-role permission checks, the full admin user lifecycle (create → role
  diff → suspend → soft-delete, including self-lockout guards), the project
  create/update lifecycle (duplicate-code rejection, per-tenant code uniqueness,
  audit before/after snapshots, cross-tenant update rejection), the department
  lifecycle (hierarchy, cycle prevention, delete guards, self-manager rejection,
  soft-delete cascade nulling `managerId`/`headUserId`, tenant isolation), and the
  subsidiary view (KPI counts, per-org-unit status/progress vs. overall rollup,
  status/search filtering, tenant isolation).

See [`docs/10-build-plan.md`](./docs/10-build-plan.md) for what's next (Milestone 7:
RAID — risks, issues, gap report).

`dashboard:read` (needed for `/dashboard`, everyone's post-login landing page) is now
granted to every role except `DepartmentHead`, a dynamic approval-only role — see
`docs/07-auth-rbac.md`'s Milestone 4 update note.
