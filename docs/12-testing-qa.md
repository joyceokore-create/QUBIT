# 12 — Testing & QA

Quality gates must pass before any milestone is "done": `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and (from Milestone 4) `pnpm test:e2e` for the touched flows.

## Test layers

| Layer | Tool | What it covers |
|-------|------|----------------|
| Unit | Vitest | pure logic: RAG rollups, avg-progress, heatmap cell status, `can()` permission resolution |
| Component | Vitest + RTL | KpiStrip, HealthHeatmap, StatusPill, SlidePanel render + interactions |
| Integration | Vitest + test Postgres | route handlers with real Prisma + RLS context |
| RLS isolation | Vitest/Playwright | **cross-tenant** — a tenant-A user cannot read/write tenant-B data |
| RBAC | Vitest | each role sees only permitted endpoints/nav; SoD enforced |
| E2E | Playwright | login → dashboard → drill-down → panel; RAID create → materialise → gap report |

## Mandatory tests (gate every milestone)

1. **Tenant isolation:** seed A and B; auth as A; every list/detail endpoint returns only A;
   fetching a known B id returns 404/empty; inserting with a mismatched tenant is rejected by
   `WITH CHECK`.
2. **Permission enforcement:** a Viewer cannot mutate; a Contributor cannot access Finance/IAM;
   nav hides unpermitted items; server returns 403.
3. **Audit:** each create/update/delete writes an `audit_log` row with correct actor/tenant.

## Derived-value tests (match the reference exactly)

- Project overall progress = mean of subsidiary progress.
- Portfolio avg progress = mean of project overall progress.
- Heatmap cell status = worst of {Overdue, At Risk, On Track} present.
- Empty portfolio×subsidiary pairing renders the dashed `—` cell.

## PMO use-case acceptance (Milestone 7)

- Risk with owner appears in project RAID + escalations feed with live status.
- Test areas (pilot-scoped) are trackable and reportable for go/no-go.
- Materialised risk → issue keeps `originRiskId`; gap report flags occurred issues with no
  prior owned/mitigated risk.

## Test data

- Synthetic only. Two tenants. No real PII. Deterministic seed so assertions are stable.
- A dedicated ephemeral Postgres in CI; run migrations + `rls.sql` before the suite.

## CI pipeline (suggested)

```
install → prisma migrate deploy + rls.sql → lint → typecheck → unit/integration/rls → e2e (smoke)
```

## Manual QA checklist per release

- [ ] Switch tenant (super-admin) → theme + data change; action audited.
- [ ] KCB green / Riverbank red across shell, buttons, active nav.
- [ ] Heatmap click-through and breadcrumbs correct.
- [ ] Panels open/close (✕, overlay, Esc); focus trapped.
- [ ] No secrets/PII in logs, network payloads, or seed data.
