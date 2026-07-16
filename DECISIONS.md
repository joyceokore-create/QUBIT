# DECISIONS — QUBIT ClickUp transformation

Running log of non-obvious calls made during the transformation (per
`docs/clickup-transformation/CLAUDE.md`: ambiguity → decide, prefer ClickUp
behavior, record here).

## MVP1 — Riverbank org structure (2026-07-15)

### DM1.1 — Riverbank is ONE organization: flat departments, no org units/branches
Business requirement (Joyce, 2026-07-15): Riverbank has no subsidiaries, regions,
or branches — everyone works under one organization, organized only by
departments. The seed's `WR` (West Region) and `CR` (Coast Region) org units are
wrong and must be removed.

**Implementation (chosen to avoid a schema migration during MVP1):**
1. Keep exactly ONE internal org unit for Riverbank (`HQ` → rename display name to
   "Riverbank") purely as the anchor for `ProjectOrgStatus` (whose `orgUnitId` is
   non-nullable and feeds RAG/progress/milestones). It is an implementation
   detail, not an org concept.
2. Hide the org-unit concept from Riverbank's UI: sidebar hides the
   "Subsidiaries" nav group when a tenant has ≤1 org unit (`nav.orgUnits.length`);
   same guard on any org-unit filter/heatmap axis. KCB (multi-org-unit) is
   unaffected.
3. Seed Riverbank departments (flat, `orgUnitId` unset, using the existing
   `Department` model): **HR · Development · QA · PMO · Executive Office**.
   Leadership is expressed as roles/department heads, not departments:
   CEO + CTO + Executives → members of Executive Office (Executive role);
   Head of QA → `Department.headUserId` of QA; Project managers & PMOs →
   PMO department with ProjectManager/PortfolioManager roles.
4. Admin → Organization tab for Riverbank renders the flat department list
   (existing self-referential `Department` support; per schema comment this was
   always the intent — "Riverbank leaves orgUnitId unset").
5. Post-MVP1 (Phase C/D): make `ProjectOrgStatus.orgUnitId` optional (or move
   status to Project level) and drop the anchor org unit.

## Phase 0 — Foundation (2026-07-10)

### D0.1 — `tenantId` + RLS on every new table, including join tables
`03-data-model.md` omits `tenantId` from `Status` and the join tables
(`TaskTag`, `TaskAssignee`, `TaskWatcher`). The repo enforces tenant isolation
with a per-table Postgres RLS policy keyed on `tenant_id` (`prisma/rls.sql`), so
a table without that column can't carry the policy. I added `tenant_id` + the
standard `tenant_isolation_*` policy to **all** new tenant-owned tables for
uniform, defense-in-depth isolation. Cost: one extra indexed column on the join
tables. Worth it — isolation is non-negotiable.

### D0.2 — `cuid()` ids for new models (PPM tables keep `uuid`)
The spec specifies `@default(cuid())`. Existing PPM tables use `uuid`. Mixed id
strategies across old/new tables are fine (both are text; RLS compares as text)
and common mid-migration. New models follow the spec (`cuid`); PPM tables are
untouched until Phase 8.

### D0.3 — Naming conventions follow the PPM schema, not the spec's shorthand
Kept snake_case `@@map`/`@map` table and column names (e.g. `status_group`,
`order_index`) to match the existing schema and the `prisma/rls.sql` tooling,
rather than the doc's camelCase shorthand. The doc is a model sketch; the repo
convention wins for consistency.

### D0.4 — Status inheritance is List → Space (no folder level)
`StatusGroup` attaches to a Space (or is reusable) and is referenced by a List;
Folders don't own status groups in the data model. So `resolveStatusGroupId`
walks List's own group → the owning Space's group. If folder-level status groups
are wanted later, add `folderId` to `StatusGroup` and extend the resolver.

### D0.5 — Object-level permissions are a scaffold this phase
`permissions.ts` ships the level type (`VIEW|COMMENT|EDIT|FULL`), the comparator,
and `resolveLocationLevel`/`canAccessLocation` with ancestor (space) resolution
and a private-space visibility gate. The full per-object `PermissionOverride`
matrix and Space **membership** land with those models in a later phase; until
then level derives from role defaults (admin = FULL, else EDIT) and private
spaces are admin-only. API surface is stable so handlers can adopt it now.

### D0.6 — Verified on an isolated DB, shared dev DB left untouched (BLOCKER to flag)
The shared dev database (`qubit`) has an **untracked migration**
`20260708134140_add_tasks_reminders` applied from a parallel git worktree
(`.claude/worktrees/qubit-ui/`, a concurrent "My Tasks" feature) that created its
own `task` and `reminder` tables. Two consequences:
1. `prisma migrate dev` reports drift and wants a destructive **reset** — not run.
2. That worktree's `task` table **collides** with this transformation's `Task`
   (both map to `task`), so this migration cannot be applied to the shared DB.

To stay additive/non-destructive, the migration was generated drift-proof
(`migrate diff` against the repo's own migration history) and verified — apply +
seed + full test suite (73 passing) — on an isolated database.

**Resolution (chosen 2026-07-10): dedicated transformation DB.** This repo's
local `.env` now points `DATABASE_URL` at **`qubit_clickup`** — a clean database
with the full migration history (all 7 PPM migrations + `clickup_foundation`) and
the full seed (PPM + ClickUp demo). `prisma migrate status` is clean (no drift),
`prisma migrate dev` works normally, and `pnpm test` is 73/73 green with no env
override. The legacy shared `qubit` DB is left untouched (it still has the
qubit-ui worktree's `task`/`reminder` tables); the parallel worktree keeps using
it via its own `.env`. `.env` is git-ignored, so this is a local dev-env change
only — `.env.example` still documents the default `qubit` URL.

Note the `task` table-name collision between the two efforts is deferred, not
gone: if the qubit-ui "My Tasks" feature and this transformation ever share one
database, that feature's `task`/`reminder` tables must be renamed. Flag at merge.
