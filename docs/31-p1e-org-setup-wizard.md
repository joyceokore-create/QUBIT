# 31 — P1-E Execution Spec: Organisation Setup Wizard

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read, implement, stop for review)
**Phase:** P1. Pairs with wireframe `qubit-wizards-wireframes.html` (Org setup).
**Type:** Wizard UI over mostly-existing server pieces + a bulk-invite helper. No new model.

## 0. Load first
- Reuse everywhere — this wizard mostly orchestrates existing capabilities:
  - Brand: `Tenant` (has `brandColor`, `brandLight`, `name`, `slug`).
  - Markets/departments: `OrgUnit` (`kind` Internal|Market), `src/server/departments.ts`.
  - Checkpoint templates: `CheckpointTemplate`/`Checkpoint` (seed "Product build" /
    "Market rollout" per `docs/18 §2`).
  - People: `createUser` + `mintInvite` (M-O3, `docs/22`) — invites email a set-password link.
  - First portfolio: `createPortfolio` (P1-A).
- `docs/26 §4.1` (a tenant usable in ten minutes, not by hand-run scripts).

## 1. Goal
A one-time, resumable Super-Admin wizard that stands up a tenant end-to-end so QUBIT is
usable without running `scripts/bootstrap-tenant.ts` by hand.

## 2. Schema
```prisma
// model Tenant
setupCompletedAt DateTime? @map("setup_completed_at")
```
Column-only. Used to show/hide the wizard and a "finish setup" banner. Migrate + generate.

## 3. Server — `src/server/org-setup.ts` (new; thin orchestrator)
```ts
// updateBrand(ctx, { brandColor, brandLight?, logo? })      // Tenant update; gate iam:manage/superadmin
// seedMarkets(ctx, codes[])                                  // upsert OrgUnit kind="Market" (KE,TZ,UG,RW,BI,SS,DRC)
// seedDepartments(ctx, names[])                              // via departments.ts
// ensureDefaultTemplates(ctx)                                // idempotent seed of the two checkpoint templates
// importPeople(ctx, rows[])                                  // parse-validated rows → createUser + mintInvite each; returns per-row result (invited | error), never throws the batch
// completeSetup(ctx)                                         // set Tenant.setupCompletedAt; audit "org_setup_complete"
```
All gated on `iam:manage` (Super Admin). `importPeople` reuses the M-O1 SuperAdmin-grant
guard and the M-O3 invite path (email link, or copyable link when the mailer is off).
CSV parsing: reuse the pattern in `src/server/connectors/hr-absence.ts` (CSV bridge) or
`src/lib/csv.ts`; columns: `name,email,role,group`.

## 4. Routes
- `POST /api/org-setup/brand` · `/markets` · `/departments` · `/templates` · `/import` ·
  `/complete` — each maps to the matching server fn, all gated `iam:manage`, standard envelope.

## 5. UI — `src/app/(app)/setup/…` (or a full-screen wizard) `org-setup-wizard.tsx`
Steps (match wireframe), resumable (driven by `Tenant.setupCompletedAt` + which pieces
already exist), `useAdminMutation` per step:
1. **Brand** — colour + logo upload.
2. **Markets & departments** — chips (KCB markets preselected) + department list.
3. **Checkpoint templates** — show the two seeded templates; "+ New template" optional.
4. **Import people** — CSV drop → preview table (valid / invalid rows) → send invites;
   show "N invites emailed" (or copyable links when email is off).
5. **First portfolio** — inline `createPortfolio` (P1-A), or "Skip".
Finish → `completeSetup` → land on the dashboard. A dismissible "Finish setting up QUBIT"
banner appears for Super Admins until `setupCompletedAt` is set.

## 6. Acceptance
- A fresh tenant can be brought to "usable" through the wizard alone: brand set, markets +
  departments seeded, both checkpoint templates present, people invited (emails or copy
  links), a first portfolio created.
- Every step is idempotent and resumable (re-running doesn't duplicate markets/templates).
- `importPeople` reports per-row outcomes and never aborts the whole batch on one bad row;
  no temp passwords are generated (M-O3 invite links only).
- All actions gated on `iam:manage`; audited; RLS holds.

## 7. Tests
- `tests/rls/org-setup.test.ts`: seedMarkets/seedDepartments/ensureDefaultTemplates are
  idempotent; importPeople creates INVITED users + tokens and skips a duplicate email with
  a row error; completeSetup stamps the tenant; non-superadmin is denied; cross-tenant
  isolation.
- `tests/unit/import-people-csv.test.ts`: CSV parse + row validation.

## 8. Verify
```bash
pnpm prisma migrate dev && pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- org-setup import-people
```
Commit: `feat(admin): guided organisation setup wizard (P1-E)`.
