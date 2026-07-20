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

## MVP1 — Editable role permissions & sign-out, Phase 1.5 (2026-07-17)

### DM1.7 — Role → permission sets are tenant-editable (reverses "roles fixed in code")
Requested by Joyce: admins can customise what each role may do (e.g. grant `Member`
`task:write` / `issue:write`). New `RolePermission` table (tenant-scoped, FORCE RLS,
migration `20260717130000_role_permissions`) holds per-tenant overrides. A role's effective
permissions are the code default (`rbac.ts` ROLE_PERMISSIONS) UNLESS the tenant has rows for
that role — replace semantics. Saving the exact default or an empty set clears the override.
**PlatformSuperAdmin is LOCKED to `*`** — never editable — so an admin can't remove their own
access. Edited in Admin → Roles (gated on the new `roles:manage`, PlatformSuperAdmin-only).

**Resolution model:** effective permissions are resolved at LOGIN and baked into the session
(`session.user.permissions`, via `src/server/role-permissions.ts`). `can()` uses
`ctx.permissions` when present and falls back to the code role-map otherwise — so the Phase 1
tests, internal contexts, and pre-existing sessions keep working unchanged, and `can()` stays
synchronous (no async refactor of ~20 call sites). Every ctx-construction site now carries
`permissions`. **Trade-off (accepted):** a permission change takes effect on each affected
user's NEXT sign-in, not mid-session. Changing a USER's role assignment
(Admin → Users → Edit roles → PATCH) was already supported and is unchanged.

### DM1.8 — Sign-out moved to a server action
The account dropdown's client `signOut()` (`next-auth/react`) could be aborted when the menu
unmounts on select, and is less reliable behind the reverse proxy. Replaced with a server
action (`src/lib/auth-actions.ts`) invoked via `<form action>`, which clears the session and
redirects server-side. (`redirectTo`, not the deprecated `callbackUrl`, is the correct v5
client option — but the server action sidesteps the client path entirely.)

## MVP1 — Admin console scoping, Phase 4 (2026-07-17)

### DM1.9 — Admin routes migrated off the coarse `iam:manage` to per-action gates
PROMPT §5. The admin console is now visible to SuperAdmin + both heads (`admin:access`), with
authority enforced **server-side per action** (not by hiding tabs):
- users create/invite → `users:invite` (SuperAdmin + heads); roles / suspend / reactivate /
  delete → `users:roles` / `users:suspend` (SuperAdmin only)
- departments create → `departments:manage` (SuperAdmin only at the role level); department
  `[id]` edit/delete → `canManageDepartment` (SuperAdmin any, a head = their own dept);
  user↔department membership → same scope
- teams create → `teams:create`; team `[id]` manage → `canManageTeam` (SuperAdmin + heads, or
  the team lead)
- audit view → SuperAdmin only; Admin → Roles editing → `roles:manage` (SuperAdmin only)

The Users tab renders **read-only for heads** (directory + Invite; no roles/suspend/delete);
nav pills + sidebar show Admin/Teams on `admin:access`. This retires the DM1.4 transitional
`iam:manage` gating for the admin surface (write routes elsewhere still use `project:update`
until their own phases).

**Deferred (noted, not silently dropped):** admin-header tab-hiding for heads (a head can
still reach Roles read-only, and Audit → Forbidden — a rough edge, not a security hole); the
non-admin "Teams page for everyone" and the project **join-request flow** → Phase 5 (they also
unblock the stubbed PM dashboard widget).

## MVP1 — Dashboard scope & contribution writes (2026-07-18, per Joyce)

### DM1.10 — One all-projects dashboard + personalized overview (reverts the Phase 3 per-role bodies)
Every user's dashboard shows ALL projects (the delivery ledger); the personalized part is the
OVERVIEW — the briefing hero (`getBriefing`), scoped to the viewer's own projects/work. The
Phase 3 per-role bodies (Executive/HeadOfQA/PM/SuperAdmin) that REPLACED the project list with
role-specific widgets are removed, along with the role-switcher, the landing-priority routing
(Members no longer redirect off `/dashboard`), and the AI token count. Deleted:
`lib/dashboards.ts`, `components/dashboard/{bodies,widgets,dashboard-switcher}.tsx` and their
tests. The briefing hero + the `getBriefing` relevance engine stay.

### DM1.11 — Writes gated on project MEMBERSHIP, not lead/PM (loosens DM1.3 §2)
The only write restrictions are (a) creating a project (role-gated: SuperAdmin, heads,
ProjectManager) and (b) writing risks/tasks/blockers in a project you're NOT part of. So ANY
member of a project — its lead OR any allocated member of any project-role — may create/edit
its tasks, risks and blockers, not just the lead/PM. Implemented by loosening
`canWriteTask`/`canWriteRiskOrBlocker` to `isProjectMemberTx`, adding `canContributeToProject`
+ `canWriteRisk`/`canWriteBlocker` (`src/lib/access.ts`), and moving the task/risk/blocker write
routes off the coarse `project:update`/`risk:create` role gates to authenticate-then-membership.
The workspace/panel split `canEdit` (settings/team — lead/PM/heads) from `canContribute`
(tasks/blockers — any member). Editing project SETTINGS/team stays lead/PM/heads.

## MVP1 — My Tasks buckets & join requests, Phase 5 (2026-07-18)

### DM1.12 — My Tasks role-aware buckets (§6)
Added to the personal My Tasks list: a "Blocked — waiting on others" bucket (everyone), an
"Across my projects" section for ProjectManager/HeadOfProjects (open tasks on projects they run,
assigned to the team), an "In test" section for HeadOfQA (Testing/UAT/SIT tasks), and a
role-aware empty state (pure Members get a "join a project" CTA). Role sections are read-only
reference lists (other people's tasks — deep-link only).

### DM1.13 — Project join-request flow (§2/§5/§6)
`JoinRequest` model + migration `20260718120000_join_requests` (tenant-scoped, FORCE RLS).
Anyone may request to join a project (`project:join:request`); the project's lead/PM — or a
head/SuperAdmin (`project:write`) — approves or denies, enforced server-side via
`canWriteProject`. Approval creates a `ProjectMember` with the granted role; an **Executive who
joins defaults to `Stakeholder`** (assumption 5). Surfaced as a "Request to join" button on
projects the viewer isn't part of and an "Awaiting my approval" queue in My Tasks (self-hiding →
fills the §6 bucket). One Pending request per (project, user) is enforced in app code. Also
fixed `resetTenant` to clear `role_permission` before the tenant delete (`join_request` cascades
with projects). **Still open:** the AI plan-approval flow (`ProjectTask.approvalStatus`).

### DM1.14 — AI plan-approval workflow (§2.2)
`ProjectTask.approvalStatus` (Draft | Published, default Published) + migration
`20260718130000_task_approval_status`. AI-generated tasks (the generate-from-document flow)
land as **Draft**; manual tasks are Published. Draft tasks are EXCLUDED from progress %,
My Tasks / member views, the relevance briefing (`getBriefing`), and Q report activity — so
unapproved AI output never inflates progress or reports. Any project member approves them on
the board ("Approve N drafts" → `publishProjectDrafts`, or per-task via `updateTask`), gated on
`canContributeToProject` (consistent with DM1.11). This completes Phase 5.

## Phase 6 — Delivery workflow (2026-07-20)

Plan: `docs/15-phase6-delivery-workflow-plan.md` (milestones 6.1–6.5).

### DM1.15 — Phase 6 open decisions resolved
The five open decisions in docs/15 §"Open decisions", resolved with the recommended
defaults (grounded in the actual data, which turned out friendlier than the plan assumed):

1. **Project roles: no data migration.** `PROJECT_ROLES` (`src/lib/roles.ts`) is already a
   canonical 10-role list enforced by the member-add UI, so the planned free-text→4-role
   collapse is unnecessary. Instead add a **category mapping** `projectRoleCategory(role)`
   → `PM | Dev | QA | Stakeholder`: Project Manager → PM; Technical Lead / Developer /
   UX Designer → Dev; QA Lead (+ new list entry "QA Engineer") → QA; everything else,
   including unknown free-text from old join requests, → Stakeholder. Going forward,
   `setProjectMember` and join-request roles are validated against the list server-side.
2. **Legacy Blocked tasks migrate to InProgress + Blocker.** The 6.1 migration converts
   `project_task.status = 'Blocked'` → `InProgress` and creates a linked Open `Blocker`
   ("Migrated from Blocked status", severity Medium, owner = task assignee if set). Seed
   creates no such rows; this targets user-created rows on the deployed box (migrations
   run at container start, so it applies on deploy).
3. **Publish gate tightens to `canWriteProject`** (lead / PM-member / heads / SuperAdmin):
   publishing drafts — bulk `publishProjectDrafts` or per-task `approvalStatus` change —
   is PM-level; *generation* stays `canContributeToProject`. Amends DM1.14, which let any
   member approve; an approval gate the whole team can open is not a gate.
4. **Cron transport: host crontab → guarded route.** `POST /api/internal/cron` guarded by
   a `CRON_SECRET` env token (timing-safe compare), hit by the box's crontab. No new
   dependency; the sidecar option adds a service for no gain. (Lands in 6.4.)
5. **Nudge thresholds: docs/15 defaults adopted**, held in one config object
   (`src/server/nudger/config.ts` when 6.4 lands) so Head-of-Projects tuning is a
   one-file edit.

### DM1.16 — Milestone 6.1 shipped: task taxonomy, keys, status expansion, blocked-as-flag
Migration `20260720120000_phase6_task_taxonomy`. `ProjectTask` gains
`type` (Feature|Bug|Chore|Spike|Improvement), `taskKey`, `severity`, `reporterId`,
`parentTaskId`, `sourceDocumentId`, `milestoneId`, `lastActivityAt`; statuses are now
`NotStarted|InProgress|InReview|InQA|Completed`. Notable calls:

- **Task keys** (`<project.code>-<n>`, unique per project) are claimed from a new
  `project_task_counter` table via `INSERT … ON CONFLICT DO NOTHING` + `UPDATE …
  RETURNING` inside the enclosing transaction (`allocateTaskKeys`,
  `src/server/project-tasks.ts`) — row-lock serializes concurrent claims (tested).
  **Drafts hold no key**; publishing (bulk, or per-task via `updateTask`) claims one, so
  unapproved AI plans never burn numbers. `Project.code` was already unique per tenant.
- **Blocked is a flag, not a column.** `Blocker.taskId` (SetNull on task delete) links a
  live impediment to the task it stalls; a task is "blocked" while an Open linked blocker
  exists. Flag/unflag via `POST/DELETE /api/tasks/[id]/block` (reason required — that's
  what feeds the nudger and reports). The migration converted existing `status='Blocked'`
  rows to `InProgress` + a linked Open blocker (DM1.15 №2). Progress/briefing/manager
  report now derive "blocked" from open linked blockers.
- **HeadOfQA task-write scope extended** (`src/lib/access.ts`): Testing/UAT/SIT phases
  (as before) OR status InReview/InQA OR `type: Bug`.
- **Roles**: "QA Engineer" added to `PROJECT_ROLES`; `projectRoleCategory()` maps any
  role (incl. legacy free-text → Stakeholder) to PM|Dev|QA|Stakeholder (DM1.15 №1).
  `setProjectMember`, join requests and admin invite now validate against the list.
- **Board**: five columns; blocked badge + inline flag/unflag; task key + non-Feature
  type shown in the card meta. `lastActivityAt` is touched by every task mutation
  (feeds the 6.4 nudger).
- **Seed** ships 4 typed, keyed demo tasks + 1 linked open blocker per tenant's first
  project; `blockers.test.ts` counts became baseline-relative (tenant-wide counts now
  include seed rows). New suite: `tests/rls/task-taxonomy.test.ts` (keys, concurrency,
  draft→publish keying, blocked flag, RLS on the counter). 368/368 tests green.

Still open for review: the reporter is set for ALL manually-added tasks (creator), not
just bugs — deliberate (uniform authorship), flag if unwanted. 6.2 (role-lens boards +
QA authoring flow) is next.

### DM1.17 — Assign-on-create, join-request notifications, required project lead (per Joyce, 2026-07-20)
Three requirements from Joyce, pulled ahead of 6.2:

1. **Assign + place at creation.** `TaskInput` gains `assigneeId` + `status`; `addTasks`
   validates assignees exist (tenant-scoped). The board's add-task composer expands when a
   title is typed: type, assignee (project members, shown with their role), and starting
   column. Q's generate flow is unchanged (AI tasks still land Draft/unassigned).
2. **Join-request notifications.** `requestToJoin` now fans out `Notification` rows
   (kind `join_request`, link `/my-tasks` — the approval queue) to the recipients that
   mirror the approval gate: project lead + "Project Manager" members; if the project has
   neither, **every HeadOfProjects in the tenant** (fallback so a request never lands
   nowhere). Requester excluded. Audit row records `notified` count.
3. **Every project gets a PM at creation.** `CreateProjectInput` accepts `leadUserId`;
   both New-project dialogs REQUIRE choosing a "Project manager (lead)" before create
   (user list from `/api/v1/users`). `createProject` validates the lead and **enrols them
   as a "Project Manager" `ProjectMember`** so membership-scoped checks, lenses, and
   notifications all see them. Kept optional at the Zod level for API/tests back-compat —
   the enforcement point is the UI (existing tests create leadless fixtures); the
   HeadOfProjects notification fallback covers legacy/API-created projects.

Notification cleanup added to the join-request test fixture (Notification.user FK is
RESTRICT — user deletes fail if their notifications survive). 372/372 tests green.
Deferred (noted for 6.2): notify the requester on approve/deny; notify an assignee when
a task is assigned to them.

### DM1.18 — OPS GOTCHA: SQL data migrations silently no-op in production
Discovered while verifying the 6.1 deploy. On the box, `prisma migrate deploy` runs as
the **`qubit` app role** (non-superuser, no BYPASSRLS), tables are owned by `qubit`, and
`prisma/rls.sql` uses **FORCE ROW LEVEL SECURITY** — so with no `app.tenant_id` set, the
tenant policies deny every row and any data-migration `UPDATE`/`INSERT` on tenant tables
**matches 0 rows without erroring**. DDL is unaffected. Locally the DB user is a
superuser, so data migrations work — the failure is production-only and silent.
The 6.1 migration was verified unaffected (prod had 0 Blocked tasks; checked as
superuser post-deploy). **Rule for every future data migration:** wrap tenant-table DML
in a `DO $$` block that iterates `SELECT id FROM tenant` (the tenant table carries no
RLS) and runs `PERFORM set_config('app.tenant_id', <id>, true)` before the DML for each
tenant — or ship the change as an app-level backfill instead.

### DM1.19 — Milestone 6.2 shipped: role-lens boards + QA authoring flow
No schema change. What landed:

- **Lenses** (`src/lib/board-lens.ts`, pure + unit-tested): All / Dev / QA tabs filter
  ONE task list — never separate boards. Dev = non-Bug work + assigned bugs; QA =
  InReview/InQA + all bugs, with unassigned bugs pinned in a **Triage strip** (inline
  assign). Default lens from the viewer's `projectRoleCategory` (lead/publisher → PM →
  "All"), passed through the workspace page as `viewerCategory`.
- **Publish gate enforced** (DM1.15 №3): `POST /tasks/publish` and any `approvalStatus`
  change via `PATCH /api/tasks/[id]` now require `canWriteProject` (new
  `canPublishTask` helper). Non-publishers see "N drafts awaiting PM approval" instead
  of the approve button. Generation stays any-member.
- **Bug filing** (`bug-dialog.tsx`): typed Bug with severity, steps-to-reproduce
  template, assignee dropdown filtered to Dev-category members (falls back to all
  members on small teams), optional `parentTaskId` ("found while testing", validated
  same-project in `addTasks`).
- **Notifications** (all skipped for Drafts so unapproved AI stays invisible):
  `task_assigned` on create/re-assign (never self); `bug_ready_for_qa` to the REPORTER
  when a Bug reaches InQA — QA closes bugs, devs don't self-certify; join-request
  approve/deny now notifies the requester (closes the DM1.17 loop).
- **Board hygiene**: aging tint + "Stale" chip (> 5 business days without activity, only
  InProgress/InReview); soft WIP warning on the In-progress column header (> 3 open per
  assignee, tooltip names them); task-key chip is click-to-copy (feeds the 6.3 commit
  grammar); severity badge on bugs.
- **Deferred from the 6.2 plan**: PM swimlanes by assignee/milestone — parked until the
  milestone-linking UI exists (milestoneId is in the schema since 6.1 but unused in UI).

Verified in-browser (lens tabs + counts, triage, bug dialog, publish-gate hint) and by
`tests/unit/board-lens.test.ts` + `tests/rls/delivery-workflow.test.ts`. 384/384 green.

### DM1.20 — Work-cycle UX: deep links, Mine-everywhere, My Tasks actioning (per Joyce)
Design discussion 2026-07-20. Joyce asked for (a) My Tasks rows opening the board, (b)
dev/tester board differentiation with per-person focus, (c) "filter mine everywhere".
On (b) I pushed back on HARD per-person visibility (it would reverse DM1.10's
global-read model and break handoffs/triage); agreed shape is **a Mine FILTER the user
controls, never a wall**. What landed:

- **Deep links**: `/projects/[id]?tab=Board&task=<id>&lens=qa|dev|all`. The workspace
  reads searchParams; the board ensures the target card is visible (switches lens off
  Mine if needed), scrolls to it and pulses a brand ring for ~3.5s. `task_assigned` and
  `bug_ready_for_qa` notifications now link to the exact card (`addTasks` switched to
  `createManyAndReturn` for ids); bug notifications land on the QA lens.
- **Mine everywhere**: board chip (default ON for Dev/QA members, OFF for PM/
  stakeholders; QA triage strip exempt — unassigned bugs are nobody's yet); projects
  page MINE chip (`isMine` = leads or allocated); risks table Mine chip (owner). All
  client-side filters over the same data.
- **My Tasks actioning**: every row + focus card gets the 5-status select and inline
  flag-blocked (reason required); the Blocked bucket shows the blocker's reason; rows
  and the PM/QA reference sections deep-link to the board card (QA → `lens=qa`);
  "My week" button links to the Reports centre (auto-delivery lands in 6.4).
- `MyTaskRow` gains `blockedReason`; seed now makes the first user the demo project's
  lead + PM member (mirrors DM1.17 behaviour — MINE filters and member counts have
  data to show). 385/385 tests green; verified in-browser end-to-end.

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
