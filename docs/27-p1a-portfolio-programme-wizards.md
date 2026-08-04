# 27 — P1-A Execution Spec: Portfolio & Programme Creation + Wizards

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read, implement, stop for review)
**Phase:** P1 "Create & assign" (`docs/26 §11`). Pairs with wizard wireframe
`docs/wireframes/qubit-wizards-wireframes.html` (Portfolio / Programme).
**Type:** Small schema add + server + routes + wizard UI.

## 0. Load first
- `prisma/schema.prisma`: `model Portfolio` (has `viewKind Pipeline|Rollout`, `ownerId`,
  `targetBudget` — **no category field yet**), `model Programme` (has `status`, `portfolioId`).
- `src/server/projects.ts:453` `unassignedPortfolioId()` — the only place a portfolio is
  created today; there is **no** `createPortfolio`/`createProgramme` server function yet.
- Shared UI: `useAdminMutation` (`src/components/admin/use-admin-mutation.ts`) and the
  wizard chrome/steps illustrated in the wireframe.
- `docs/24 §portfolio` + `docs/25 §7` (portfolio = cards, categories Approved/Exploring/Shelved).

## 1. Goal
Give portfolios and programmes real, wizard-driven creation with the category + lens the
business uses, replacing the implicit "Unassigned" auto-create.

## 2. Schema (migration `mN_portfolio_category`)
Add to `model Portfolio`:
```prisma
category       String   @default("Exploring") @map("category") // Approved | Exploring | Shelved
defaultMarkets String[] @default([]) @map("default_markets")   // OrgUnit.code[] — pre-fills the project wizard (Rollout)
```
`Programme.status` already carries the same three values — reuse it (no add). Both tables
are already tenant-scoped + RLS; no `rls.sql` change (column-only). Migrate + generate.

## 3. Server — `src/server/portfolios.ts` (new) & `src/server/programmes.ts` (new)
```ts
// portfolios.ts
export const CreatePortfolioInput = z.object({
  name: z.string().min(1),
  ownerId: z.string().uuid().nullable().optional(),
  category: z.enum(["Approved","Exploring","Shelved"]).default("Exploring"),
  viewKind: z.enum(["Pipeline","Rollout"]).default("Pipeline"),
  defaultMarkets: z.array(z.string()).default([]),      // validated against OrgUnit.kind==="Market"
});
export async function createPortfolio(ctx, input)   // withTenant; validate market codes exist & are Market; audit "create"; return {id}
export async function listPortfolios(ctx)            // grouped-ready summaries (name, category, viewKind, counts)
export async function updatePortfolio(ctx, id, patch)// governance edits; audited
```
```ts
// programmes.ts
export const CreateProgrammeInput = z.object({
  name: z.string().min(1),
  portfolioId: z.string().uuid(),                     // required — programmes live in a portfolio
  ownerId: z.string().uuid().nullable().optional(),
  status: z.enum(["Approved","Exploring","Shelved"]).default("Approved"),
});
export async function createProgramme(ctx, input)     // validate portfolio in tenant; audit; return {id}
```
Guard: creating/editing a portfolio or programme requires `project:create` (held by
HeadOfProjects/HeadOfQA/PM per `rbac.ts`) — reuse; do not invent a new key here.

## 4. Routes
- `POST /api/portfolios` → `createPortfolio` (gate `project:create`).
- `PATCH /api/portfolios/[id]` → `updatePortfolio`.
- `POST /api/programmes` → `createProgramme`.
Standard guard-then-Zod-then-serve; map the typed errors to 400 via the shared envelope.

## 5. UI
- **Portfolio page** (`src/app/(app)/portfolio/…`): render square cards grouped by
  **Approved / Exploring / Shelved**; "+ New portfolio" visible for `project:create`.
- **Portfolio wizard** (`portfolio-wizard.tsx`): steps Identity → Lens → Markets
  (only when `viewKind==="Rollout"`, chips from Market org units) → Governance → Review,
  submitting via `useAdminMutation`. Match the wireframe.
- **Programme wizard**: single-step dialog (name, parent portfolio, owner, category).
- Wizard chrome (step rail, Back/Next, Review, draft-in-memory) can be a small shared
  `src/components/wizard/*` used again by P1-B.

## 6. Acceptance
- A portfolio can be created with category + lens; Rollout shows the Markets step, Pipeline
  hides it; markets validated against Market org units.
- Portfolio page groups cards by category; add button gated on `project:create`.
- A programme requires a portfolio; appears under it.
- Every create/edit writes an audit row; RLS isolation holds (test both tenants).

## 7. Tests
- `tests/rls/portfolios.test.ts`: create (both lenses), market validation rejects a
  non-Market code, cross-tenant isolation, audit rows.
- `tests/rls/programmes.test.ts`: create requires a valid in-tenant portfolio.

## 8. Verify
```bash
pnpm prisma migrate dev && pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- portfolios programmes
```
Commit: `feat(ppm): portfolio & programme creation wizards + category/lens (P1-A)`.
