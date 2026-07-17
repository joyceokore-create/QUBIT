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

## MVP1 — Personalized dashboards, Phase 1 (2026-07-17)

Roles/permissions groundwork for role- and identity-personalized dashboards
(`PROMPT-personalized-dashboards.md`). Confirmed with Joyce in-session.

### DM1.2 — Consolidated to six canonical roles; `PlatformSuperAdmin` repurposed
The legacy role set (SystemAdmin, PortfolioManager, Executive, FinanceManager,
Contributor, Viewer, DepartmentHead, PlatformSuperAdmin) collapses to six tenant
roles: **PlatformSuperAdmin, HeadOfProjects, HeadOfQA, Executive, ProjectManager,
Member**. Migration `20260717120000_canonical_roles` remaps existing
`role_assignment` grants:

| Legacy role | Canonical |
|---|---|
| SystemAdmin | PlatformSuperAdmin |
| PlatformSuperAdmin (old, read-only oversight) | Executive |
| PortfolioManager | HeadOfProjects |
| FinanceManager | Executive |
| Contributor | Member |
| Viewer | Member |
| DepartmentHead | Member (dept-head powers now derive from `Department.headUserId` + a Head role) |

`PlatformSuperAdmin` previously meant a **cross-tenant, read-only** oversight role
("no business-data authoring", docs/07); it is now the full-write tenant superadmin.
**Security-critical:** the migration demotes old-`PlatformSuperAdmin` → `Executive`
*before* promoting `SystemAdmin` → `PlatformSuperAdmin`, so today's read-only
oversight accounts are never silently elevated to full write. `role_assignment` has
FORCE RLS and `migrate deploy` runs as the non-superuser app role, so the remap
disables RLS on the table for the UPDATE, then restores ENABLE + FORCE.

### DM1.3 — "Global read, scoped write": role-level `can()` + async resource helpers
Every authenticated user READs everything in their tenant (RLS still scopes to the
tenant). WRITE is scoped. `can()` (src/lib/rbac.ts) stays a pure role→permission check
and answers only role-level questions. Resource-scoped writes ("edit THIS project
because I lead it", "report on a person in MY project", "budget for MY project", "QA
edits a task in Testing/UAT", "manage MY department", "manage MY team") are decided by
async helpers in **src/lib/access.ts** that read membership under RLS and never trust a
client-supplied scope. A role denied at the role level may still be granted for a
specific resource it owns/leads. The matcher supports N-segment keys and `*` wildcards
(`teams:*`, `report:resource:others`, superadmin `*`).

### DM1.4 — Legacy coarse keys retained transitionally
~35 existing write routes are gated on the coarse `project:update`, and all admin
routes on `iam:manage`. Phase 1 does NOT rewrite those guards (that is Phase 3/4 work
and would regress every write path). Instead the canonical roles are mapped onto those
keys (ProjectManager + HeadOfProjects get `project:update`; only PlatformSuperAdmin
holds `iam:manage`, via its `*` grant). Each route migrates to the fine-grained new
keys / access.ts helpers in the phase that touches it. Consequence for Phase 1: a PM can
still edit any project via the coarse key (per-project scoping via `canWriteProject`
lands with the workspace phase), and heads' scoped admin console is deferred to Phase 4.

### DM1.5 — Permission matrix seeded at the unit layer
`PROMPT` §8 asks for `tests/rls/permissions-matrix.test.ts` asserting via the API. The
role×action decision spine is a pure function, so it lives in
**tests/unit/permissions-matrix.test.ts** (runnable without a DB). API-level and
resource-scoped rows (join requests, teams:create, budget, QA phase) are added under
tests/rls as each phase builds its routes — logged, not silently skipped.

### DM1.6 — Riverbank seed rebuilt to DM1.1 (done this phase, per Joyce)
Dropped the wrong `WR`/`CR` region org units (kept the single hidden `HQ` anchor,
renamed "Riverbank"); added the flat departments **HR · Development · QA · PMO ·
Executive Office** (headless). Sidebar "Subsidiaries" group now hidden when a tenant has
≤1 org unit.

Riverbank is the firm's REAL tenant (`riverbank.solutions`), so only the real owner
account **Joyce Okore (PlatformSuperAdmin)** is seeded — no synthetic demo people. (An
earlier draft of this phase seeded six role-varied users to make the §4 persona-dashboard
acceptance demoable; removed per Joyce 2026-07-17.) Consequence: the six-persona
acceptance is exercised by onboarding users in-app — or via the fully-synthetic KCB
tenant — not from the Riverbank seed.

Also fixed a pre-existing `resetTenant` gap that blocked re-seeding: it never deleted
`shared_report` rows (added in a later migration) and now also clears the seeded
`department` rows; both hold a RESTRICT tenant FK.

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
