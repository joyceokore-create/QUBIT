# 10 — Build Plan (Milestones for Claude Code)

Execute one milestone at a time. Each ends with a working, reviewable increment where
`pnpm lint`, `pnpm typecheck` and `pnpm test` pass, RLS isolation holds, and mutations are
audited. Ask for review before starting the next.

## Milestone 0 — Scaffold & tooling
- Scaffold Next.js + TS + Tailwind app (`docs/03-dependencies.md`).
- Add Prettier, ESLint, Vitest, Playwright configs and the `package.json` scripts.
- Set up shadcn/ui and the base component list.
- Load Inter + Syne via `next/font`.
- **Done when:** app runs, quality scripts wired, a trivial component test passes.

## Milestone 1 — Database, Prisma & RLS
- Add Prisma; implement the Phase A schema (`docs/05-data-model.md`).
- Create `prisma/rls.sql` and wire it into a migration; enable + force RLS on all
  tenant-owned tables (`docs/04-multitenancy.md`).
- Implement `lib/db.ts`, `lib/tenant.ts` (`withTenant`, `getTenantContext`).
- Write `prisma/seed.ts` with two synthetic tenants (KCB from the dashboard data; a small
  Riverbank set).
- Add `tests/rls/` proving cross-tenant isolation.
- **Done when:** migrations apply, seed runs, RLS test passes.

## Milestone 2 — Auth, RBAC & audit
- Configure Auth.js (credentials), Prisma adapter, session carrying tenant + roles.
- Implement `lib/rbac.ts` (`can()`) and `lib/audit.ts`.
- Login page; protected `(app)` layout; middleware enforcing auth + tenant context.
- Password hashing + policy; login rate limiting; TOTP MFA enrolment/verify.
- **Done when:** users log in, sessions scoped to tenant, permission checks + audit working,
  a cross-role test passes.

## Milestone 3 — App shell & per-tenant theming
- Topbar (logo, nav, TenantChip, avatar), Sidebar (grouped nav from permissions), Breadcrumb.
- Apply `--brand`/`--brand-light` from the tenant in the `(app)` layout; Tailwind `brand` utilities.
- **Done when:** KCB renders green, Riverbank renders red, nav reflects permissions, no layout regressions.

## Milestone 4 — Group Overview dashboard
- `/api/dashboard/summary`, `/heatmap`, `/escalations`, `/milestones/upcoming`.
- Build KpiStrip, HealthHeatmap (with click-through), PortfolioCard grid, StandaloneCard grid,
  Escalations + Upcoming Milestones feeds.
- **Done when:** dashboard renders from live DB for both tenants; derived values match
  `docs/09-ui-spec.md`; loading/empty states present.

## Milestone 5 — Portfolio, programme & project drill-down
- `/api/portfolios`, `/portfolios/:id`, `/programmes/:id`, `/projects`, `/projects/:id`,
  `/standalone`.
- Portfolio detail (programmes + standalone), SlidePanel (project + programme variants) with
  Progress-by-Subsidiary and Milestone Matrix.
- Project create/update (audited).
- **Done when:** full drill path Group → Portfolio → Programme → Project panel works; panels
  match the reference.

## Milestone 6 — Subsidiary view
- `/api/subsidiaries/:orgUnitId/projects`; per-subsidiary KPI strip + filterable ProjectTable;
  heatmap-cell deep-link (`?sub=`).
- **Done when:** subsidiary filtering + status chips + search work, scoped correctly.

## Milestone 7 — RAID (risks, issues, gap report)
- Risks list/create/update; heat rating (prob×impact); owner assignment.
- Materialise risk → issue preserving `originRiskId`; issues list.
- Gap report endpoint + screen (PIR: occurred issues vs owned risks).
- **Done when:** the three PMO use cases in `docs/01-prd.md` are demonstrable end to end.
- PMO use case #2 (pilot-phase test-area identification, pre-GTM go/no-go) is covered via
  `Risk.category = "Pilot/Test Area"` — no dedicated `TestArea` entity; the Risks tab's list
  and filters give the needed visibility.

## Milestone 8 — Hardening & polish
- Accessibility pass; error boundaries; consistent empty/loading; toasts (sonner).
- Full RLS + RBAC test sweep; Playwright happy-path e2e for both tenants.
- Seed both tenants for a convincing demo.
- **Done when:** all gates green; demo script works for KCB and Riverbank.

## Phase B–D backlog (later, same patterns)
- **B:** tasks, Kanban, timeline/Gantt, comments/@mentions, notifications, decisions,
  documents, project templates, change requests + approvals.
- **C:** resources/allocations (+approval, SoD), timesheets, budgets, POs, invoices, expenses,
  cost centres, FX, finance reports.
- **D:** reporting/export (CSV/PPT), executive analytics, AI assistant (risk prediction,
  summaries, anomaly detection) with logged reasoning, Azure AD SSO, HRMS/ERP/ServiceNow
  integrations, webhooks, scheduled actions.

## Working agreement for Claude Code
- Implement one milestone per PR; keep diffs small.
- Never weaken RLS or skip the isolation test to make something pass.
- If a doc is ambiguous, ask; don't invent tenant data or PII.
