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

### DM1.21 — Auto-generated project codes (per Joyce, 2026-07-20)
The New-project dialogs no longer ask for a code. `createProject` derives it from the
name: initials of the first three words ("Asset Valuation System" → AVS), or the first
three letters of a single-word name ("HomeQuest" → HOM); short/empty leftovers pad to
3 chars. Collisions within the tenant get a numeric suffix (AVS → AVS2 → AVS3 — no
hyphen, so task keys stay unambiguous: AVS2-1). A concurrent same-name race that trips
the tenant+code unique index is retried with a fresh suffix (max 3 attempts).
`CreateProjectInput.code` stays optional-and-honoured for the API, tests and seed.
Verified live: two "Orbit Pay Gateway" creates → OPG, OPG2. 386/386 tests green.

Observed while verifying (pre-existing, NOT from this change): a dev-mode hydration
mismatch on Base-UI auto-generated dropdown ids in the Topbar — tracked separately.

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

## Revamp M0 — The Cull + backbone (2026-07-28)

### DM1.22 — M0 executed; three scope calls approved by Joyce in-session
Plan: `docs/16-revamp-plan.md` §2/§10/§12 (M0). The ClickUp shadow stack is gone from
code (51 `/api/v1` routes, the `/s` surface, 12 components, 17 server modules, pg-boss,
11 test suites, the seed's demo tree); **the ~25 ClickUp Prisma models stay in
schema.prisma so no migration can drop tables before the M9 data check.** Fake-AI panels
(brief/insights/recommendations), Confidence/AI-predict columns, the Dependencies
SoonCard, and unbuilt-loop marketing copy were cut or reworded. Approved calls:

1. **`JobRun` is a global infra table** (no tenant_id/RLS — like `tenant`/
   `access_request`): the cron dispatcher runs outside tenant context and must record a
   run even when one tenant's loop fails; per-tenant outcomes live in `detail` jsonb.
   `DomainEvent` is tenant-scoped + FORCE RLS. Deviates deliberately from plan §13's
   "every new table gets tenant_id".
2. **`/time` survives trimmed**: read-only report page + `timeReport()` + relocated
   `/api/time/report` CSV. Timer UI/routes died with the ClickUp task panel; `TimeEntry`
   model stays until the M6 retarget to `ProjectTask` (its ClickUp-fixture RLS test was
   deleted; coverage returns in M6).
3. **`/portfolios` + `/standalone` index placeholders → `redirect("/projects")`**;
   `coming-soon.tsx` and the orphaned `/tasks` placeholder page deleted.

Backbone shape (M1+ builds on this):
- **Outbox**: `emitDomainEvent(tx, ctx, {type, entityType, entityId, payload, notify[]})`
  (src/server/events.ts) — called INSIDE the mutation's transaction. Consumers: durable
  `domain_event` row → `notifyUsers` fan-out → `pg_notify` (the domain event type, plus a
  named `notification.created` SSE event the bell subscribes to). All six former
  `notifyUsers` call sites (join-requests ×3, project-tasks ×2, q/draft-brd) now emit
  events; `notifyUsers` is consumer-only.
- **Jobs**: registry + `runJob(name, idempotencyKey)` (src/server/jobs) — JobRun row,
  unique-key dedupe (re-delivered cron hit = recorded no-op), tenant loop under
  `withTenant` per DM1.18. Transport: `POST /api/internal/cron`, `CRON_SECRET`
  timing-safe (DM1.15 №4). M0 ships a read-only `heartbeat` job proving the loop.
- **Health**: `src/server/health.ts` is the ONE engine (projectRag / needsAttention /
  ragRank / portfolioHealth / worstStatus / ragCounts). Exec dashboard, Q live report,
  Q mock, projects/subsidiaries all call it; `tests/rls/health-parity.test.ts` asserts
  dashboard set === Q set for 100% of projects. `QReportResult` gained `data` (the
  grounded source) to make that comparison possible — M2 check-in drafts will reuse it.
- **Relocated live routes**: `/api/users`, `/api/events` (SSE), `/api/time/report`.
  Bell is SSE-driven (EventSource, no 60s poll). Flags: `FEATURE_SPACES` /
  `FEATURE_EMAIL` / `FEATURE_COMMIT_AUTOMATION` (src/lib/flags.ts, default off) +
  `CRON_SECRET` documented in `.env.example`.

Verified: lint + typecheck + 375/375 tests green (49 files; 11 ClickUp suites removed,
4 added: health unit, health-parity, domain-events, jobs+cron). In-browser on both
tenants (KCB green topbar / Riverbank red shell): culled dashboard, SSE connect, live
bell refetch on `pg_notify`, report/dashboard attention-set parity.

## Revamp M1 — Dashboard v2 (2026-07-28)

### DM1.23 — M1 executed: snapshots, delta feed, milestone merge, ten-second dashboard
Plan: `docs/16-revamp-plan.md` §3/§12 (M1). Approved calls from review: org-unit context
baked into migrated milestone names; legacy `milestone` table dropped in M1 (not M9);
KCB-only synthetic sparkline history (Riverbank stays honestly empty until real nights).

- **Milestone merge** (`20260728150000_m1_snapshots_milestone_merge`): legacy
  per-subsidiary `Milestone` (via ProjectOrgStatus) → `ProjectMilestone`, ids preserved
  (re-run = no-op), names prefixed "🇰🇪 KCB Kenya UAT", state mapping done→Done else
  Pending ("late" is now DERIVED: Pending + past due). **The copy runs in a DM1.18
  tenant-loop DO block** — verified live: 197 KCB rows copied, then `DROP TABLE
  milestone`. Consequence: the slide-in panel lost its per-subsidiary Milestone Matrix
  (subsidiary progress bars stay); milestones live in the workspace Deadlines tab.
  `getUpcomingMilestones` repointed; relevance already read ProjectMilestone.
- **Snapshots**: `ProjectSnapshot` (unique tenant+project+day) + `PortfolioSnapshot`
  (unique tenant+day), RLS+FORCE. `nightly-snapshot` job upserts (idempotent re-runs),
  numbers come from the health engine, machine-actor audit row per tenant per night.
  Crontab line documented in docs/deployment.md (23:55 EAT).
- **Delta feed**: `User.lastDashboardSeenAt` (guarded update — a stale session for a
  reseeded user degrades, never 500s; floor window 24h so refreshes don't blank it;
  marker advances at most hourly). Pure `summarizeDeltas` over outbox events; new event
  instrumentation: `blocker.opened/resolved` (create/update/flag/unflag),
  `task.completed` (updateTask + setTaskStatus, Published only),
  `project.status_changed` (from/to). Project-scoped deltas whose project no longer
  resolves are DROPPED (deleted-project noise), status lines collapse to the last
  transition, and only RAG-boundary crossings surface (Planning→OnTrack is silent).
- **Dashboard v2** (`src/server/dashboard-v2.ts`, exec-dashboard.ts deleted): Needs
  attention (relevance, top 5) / Since you last looked / 3 KPIs (On-track %, Overdue
  tasks, Capacity pressure = people over-allocated) with server-rendered SVG sparklines
  (honest "trend after 2+ nightly snapshots" under 2 points) + health ring + heatmap
  drill-down (KCB; cells carry pct + OK/AR/OD text tags — never colour-only) or a
  per-portfolio rollup list when a tenant has ≤1 org unit (hidden entirely for
  Riverbank's 0 portfolios). Role composition per DM1.10: `Executive` role sees At-risk
  first with Today collapsed (<details>); everyone else Today first. Projects table,
  milestones/risks/capacity panels, notifications panel, and the budget KPI left the
  dashboard (kill list M1 — `parseBudget` survives only for the legacy /api/dashboard/
  summary route). Risks + Time restored to nav.
- **Parity contract**: `QReportResult.data` + `DashboardV2.projects` keep the
  dashboard-vs-Q health-parity test exact under the v2 shapes.

Verified: lint/typecheck/build green, 387/387 tests (51 files; new: snapshots RLS,
delta unit). In-browser both tenants: KCB (green, topbar) heatmap + real 14-day
sparklines + merged milestone names in the briefing; Riverbank (red, shell) honest
empty trends/delta, /time + /risks nav, stale timer copy fixed.

## Revamp M2 — The weekly loop (2026-07-28)

### DM1.24 — M2 executed: Friday check-ins, weekly report, subscriptions
Plan: `docs/16-revamp-plan.md` §7/§12 (M2). The status-reporting inversion: the system
drafts, the lead confirms — nobody retypes what QUBIT already knows.

- **Model**: `CheckIn` (unique tenant+project+isoWeek; Draft|Confirmed; computedRag from
  the health engine; `draft` jsonb holds the week's facts + rendered bullet lines;
  narrative; ragOverride + reason + `overrideExpiresAt`) and `ReportSubscription`
  (unique tenant+user+kind, "weekly_report"). Both RLS+FORCE, isolation-tested. ISO week
  helpers in `src/lib/iso-week.ts` (Mon-UTC windows, unit-tested year boundaries).
- **Drafting** (`src/server/checkins.ts`): facts from the M0 outbox (task.completed /
  blocker.opened / blocker.resolved counts via JSON-path filters), milestone movement
  (done this week; slipped = came due this week and not Done), overdue tasks now, and
  progress delta vs the last pre-week snapshot. `buildDraftLines` is pure. GET serves an
  EPHEMERAL computed draft when no row exists (the card never waits for Friday); the
  Friday job persists rows.
- **Confirm**: PM-level (`canWriteProject`, consistent with DM1.15 №3), narrative
  REQUIRED (the human line is the point), override needs a reason ≥5 chars and expires
  in exactly 7 days; `effectiveRag` honours overrides only while confirmed+unexpired
  (all pure-tested). Facts are recomputed at confirm time so the lead signs what the
  report shows. Audited + `checkin.confirmed` outbox event. An override equal to the
  computed RAG is silently dropped (not an override).
- **Jobs**: `friday-checkin-drafts` (08:00 Fri — persists drafts, never clobbers a
  confirmed row, notifies lead + PM members, kind `checkin_ready`) and `friday-report`
  (16:00 Fri — SharedReport type "weekly", `createdById: null` for the machine actor,
  one per tenant per ISO week even across differing idempotency keys). Report sections:
  portfolio health + WoW deltas from PortfolioSnapshots, per-project check-ins sorted
  red-first (confirmed = lead's narrative + override chip; else "⚠️ unconfirmed —
  computed status shown"), milestones due in the next 7 days. Subscribers notified with
  the share link; defaults seeded for Executive/HeadOfProjects/HeadOfQA/SuperAdmin
  role-holders (per-user matrix lands M5). Crontab lines in docs/deployment.md.
- **UI**: `CheckInCard` leads the workspace Overview tab — computed chip always shown,
  override renders as a second "LEAD OVERRIDE" chip beside it (never replacing the
  computed truth), confirm disabled until narrative (and reason when overriding).
  Non-PMs see "awaiting the lead's confirmation".
- **Flake fixed during gating**: the fixture lead is also the seeded demo project's
  lead, so `checkin_ready` assertions must target the fixture project's link, not
  `findFirst` order. Root-caused (not retried away) and pinned in the test.

Verified: lint/typecheck/build green, 406/406 tests (54 files; new: iso-week, checkins
unit, M2 loop RLS). Live in-browser: confirmed a real check-in with a Green override on
CBS Phase 1 (KCB) through the API + card — both chips, reason, 4 Aug expiry rendered.

## Revamp M3 — Nudger & escalation (2026-07-28)

### DM1.25 — M3 executed: the 6.4 signal matrix, weekly dedupe, escalation, snooze
Plan: `docs/16-revamp-plan.md` §12 (M3); matrix + thresholds from docs/15 §6.4 as
adopted in DM1.15 №5 (`src/server/nudger/config.ts` — one-file tuning).

- **Model**: `Nudge` — one row per fact per week, `dedupe_key = entityId:signal:isoWeek`
  unique per tenant, `escalation_level` (0 owner · 1 PM · 2 head) and `recipient_ids[]`
  resolved at write time. `NudgeSnooze` — per (user, entity, signal) with `until`:
  snooze silences one person; the nudge keeps chasing everyone else. Both RLS+FORCE.
- **Signals** (weekday-morning `nudger` job): task due ≤48h/overdue (assignee; PM at
  >2d overdue), stale InProgress/InReview >5 business days (assignee; PM at 10 — the
  matrix names no PM timing, 2× threshold chosen), open blocker >3d (owner, PM fallback;
  **at 7d PM + HeadOfProjects together** — the matrix's lone timed escalation), AI
  drafts pending >48h (PM), High/Critical bug unassigned >24h (PM + HeadOfQA),
  milestone due <7d with open linked tasks (PM; surfaces to execs via the report).
  `checkin-chase` (Monday 10:00) nudges PMs about LAST week's unconfirmed check-ins.
- **Semantics**: creation computes the level directly (a 5d-overdue task first seen
  today starts at level 1); a worsening fact escalates IN PLACE — level bump, recipients
  widened, only the newly-pulled-in people pinged ("Escalated: …"), never a duplicate
  row or a re-ping. Recipients resolve as lead + "Project Manager" members + role-held
  heads. Notifications ride the M0 outbox (kind "nudge"); machine actor audits each run.
- **Surfaces**: needs-attention strip merges the viewer's active nudges ABOVE relevance
  items (deduped by entity, cap 5, escalated = red "NUDGE · ESCALATED"); per-row snooze
  button → `POST /api/nudges/[id]/snooze` (1–30 days, default 7, recipient-only);
  friday-report gains an "## Escalations" section (level ≥1 + at-risk milestones — the
  matrix's "Executive weekly digest" target); Q gets `list_nudges` (agent tool +
  mock intent) so "what's being chased on X?" is grounded.
- Crontab lines documented in docs/deployment.md (weekdays 07:30; Monday 10:00).

Verified: lint/typecheck/build green, 419/419 tests (56 files; new: nudger unit +
nudger RLS loop). Live in-browser on KCB: cron-triggered nudger created an escalated
nudge for a 4d-overdue task → led the strip as "NUDGE · ESCALATED" → bell notification
→ snooze hid it for the viewer while the underlying fact still surfaced via relevance.

## Revamp M4 — Conversation (2026-07-28)

### DM1.26 — M4 executed: comments, @mentions, promote-to-Decision, activity feed
Plan: `docs/16-revamp-plan.md` §4/§12 (M4). Conversation attached to work — not chat
(Teams owns that); the Teams deep-link escape hatch stays parked for the Graph API phase.

- **Model**: `WorkComment` — polymorphic on entity (`project | project_task | risk |
  project_document`), **named `work_comment` because the dead ClickUp `comment` table
  survives until the M9 drop** (rename can be considered then). One-level threads:
  replies attach to the ROOT (a reply-to-a-reply re-parents to the root); `projectId`
  is DERIVED from the entity server-side at post time, never client-supplied (null only
  for register-level risks). `mentions` stores ids validated against the tenant — bad
  ids are dropped, never stored. `Decision` — what/why/who/when + `sourceCommentId`
  provenance, linked both ways. Both RLS+FORCE.
- **Permissions**: ANY authenticated tenant user may comment (global read, DM1.3 — an
  exec asking a question on a task is the point of the feature). Delete is
  author-or-PM (moderation via `canWriteProject`). **Promote-to-Decision is PM-level**
  — a decision log the whole team can write is a suggestion box, not a record. Promoting
  twice is refused; register-level risk comments (no project) can't promote.
- **Notifications** ride the M0 outbox (`comment.posted`): mentioned users (kind
  `mention`) + the thread's root author on replies (kind `comment_reply`), never the
  poster; deep links land on the exact surface (board card for tasks). Email joins in M5.
- **Activity feed** (`src/server/activity-feed.ts`): a pure projection of the
  domain-event outbox — nothing recorded separately, so it can never disagree with what
  happened. Machine actors (`job:*`) render as "QUBIT". Mounted on the workspace aside
  with the Decisions register.
- **UI**: one `CommentsSection` everywhere + a `ConversationDrawer` (Sheet) for
  entities without pages — mounted on the project Overview (inline), board cards
  (MessageSquare → drawer), risk rows, and document rows. Composer has an @mention
  picker (chips + inline @Name highlighting); promote opens a dialog prefilled from
  the comment.

Verified: lint/typecheck/build green, 430/430 tests (58 files; new: conversation RLS
end-to-end + activity-feed unit). Live in-browser on KCB: mention-comment → threaded
reply → promote — thread renders with a DECISION chip, the Decisions card shows
what/why/who/when, the Activity card narrates all three events, and the mentioned
user's notification landed.

## Role dashboards M1a — shell, personas, executive preset (2026-07-28)

### DM1.27 — docs/17 §0 adopted: composition, not forks (DM1.10 amended, not reversed)
Note: docs/17 asks for this entry as "DM1.22" and the Implementor category as "DM1.23";
both numbers were already taken by revamp milestones — recorded here as DM1.27, with
DM1.28 reserved for the Implementor category when M1c ships it.

- **One route, one shell, presets by persona.** `/dashboard` renders the preset for the
  session's resolved persona; a validated `?persona=` override powers the header
  switcher (multi-group users only). Widget registry + preset lists in
  `src/components/dashboard/presets/registry.ts`; the executive preset is the first
  consumer. Developer/PM (M1b) and QA/Implementor (M1c) personas render the proven v2
  three-questions layout in the interim — a real dashboard, never a placeholder (§9).
- **Personas are presentation, never permission** (§1): effective groups = DECLARED
  (`User.userGroups` + `primaryGroup`, set at invite/admin, audited) ∪ DERIVED
  (`projectRoleCategory` over memberships, `executive` for oversight roles, `pm` for
  leads), resolved at login and baked into the session (DM1.7 lifecycle). Landing =
  last-used (`User.lastPersona`, persisted via POST /api/me/persona) > primary >
  fixed priority. A pure stakeholder falls back to the developer (task-first) view.
  Tested both directions: granting/stripping groups changes zero permissions.
- **Executive preset per §2**: hero with decision count + priorities strip; compact
  health score + 8-week sparkline + "why?" disclosure grounded in engine counts (the
  ring is gone — the trend is the information); EXACTLY 4 KPIs with WoW deltas from
  snapshots (On-track %, At risk, Open escalations — new `portfolio_snapshot.
  escalations_open` column fed nightly — and Capacity pressure); decision queue
  (escalated nudges + unconfirmed check-ins + pending AI-draft approvals; stage gates
  join at M8, no placeholder rows); single-encoding heatmap cells (RAG + Δ arrow vs
  last week from ProjectSnapshots; count/progress on hover).
- **Heatmap axis by org-unit count** (§2 fix): Portfolio × Subsidiary for KCB;
  **Portfolio × Department for Riverbank, derived from the project LEAD's department**
  with an honest "Unassigned" bucket — projects have no department link of their own
  (a `Project.departmentId` can supersede this if wanted). Verified live on both.
- **Admin onboarding (§1.3)**: invite wizard gains declared-group chips + primary +
  a live "Will land on: X dashboard" preview computed by the SAME resolver login uses;
  /admin/users row actions gain a groups dialog showing declared (editable) vs derived
  (read-only, dashed) chips. Group edits share the invite gate (`users:invite` —
  SuperAdmin + heads), not the SuperAdmin-only roles gate: changing a landing page is
  not changing authority. All changes audited.
- Parity extended: the exec preset is a third surface asserted equal to dashboard-v2
  and Q in tests/rls/health-parity.

Verified: lint/typecheck/build green, 442/442 tests (60 files; new: personas unit +
personas RLS incl. the both-directions permission invariant and the §9 two-personas
acceptance). Live on both tenants: KCB exec preset with real +11/−2 WoW deltas and the
subsidiary axis; persona switch to PM (persisted `last_persona`); Riverbank department
axis + honest trend-accrues states.

## Role dashboards M1b — developer + PM presets (2026-07-28)

### DM1.28 — note: reserved earlier for the Implementor category; that ships M1c. This
### entry records M1b calls under the same number's section for continuity.
- **Developer preset (§4)**: `rankFocus` picks ONE task — most-overdue > due-soonest >
  awaiting-review > freshest — and BLOCKED tasks are never the focus (not actionable by
  the assignee; they live in the Blocked bucket with the blocker's reason inline).
  The focus reason is always displayed ("3d overdue — clear it first"), never an
  unexplained pick. Buckets from the existing My Tasks queries; /my-tasks stays as the
  full page. Boards deep-link with `?lens=dev`.
- **PM preset (§3)**: hero = this week's check-in ritual state + aged blockers + drafts;
  project cards carry RAG (health engine) + Δ vs last-week snapshot, progress with a
  "vs portfolio avg" chip, next milestone, open-blocker count, and an UNCONFIRMED badge;
  scope toggle mine/all is a server-rendered filter (`?scope=`), never a wall (DM1.20).
  Action queue = join requests + draft approvals + >3d blockers + tasks slipping within
  7 days, all deep-linked to where they're fixed. Team load = listWorkload filtered to
  MY projects' members (leave badges join at M6).
- **First-login checklists (§1.3)** ship for developer/pm (qa/implementor texts ready
  for M1c): pure UI nudges dismissed via localStorage — per-browser is accepted for a
  welcome card; nothing is state of record. Executives get none (§1.3).
- Registry grew the §3/§4 widget lists; the shell routes executive/developer/pm to
  dedicated presets, qa/implementor to the interim layout until M1c.

Verified: lint/typecheck/build green, 451/451 tests (62 files; new: rankFocus unit +
presets RLS covering focus/buckets, card flags, action queue, mine-vs-all, and team-load
scoping). Live on KCB: PM view (checklist, "1 of 1 unconfirmed — due Friday", AMBER card
with +21% vs avg and UNCONFIRMED badge, mine→all toggle showing all 15) and a seeded
demo developer landing on the §4 view (focus hero with Start deep link, overdue bucket,
dev-lens boards).

## M18-A — Alignment to docs/18: pipeline, per-project chips, personal boards (2026-07-29)

### DM1.29 — docs/18 §0 business decisions recorded + M18-A implementation calls
The four confirmed business decisions (docs/18 §0): (1) the global KPI strip is REMOVED
— per-project stat chips replace it; (2) real pipeline stages are Exploring → Evaluating
→ Approved (+ Paused), superseding 16-revamp §6's invented names; (3) Riverbank tracks
delivery across the seven KCB markets as a DELIVERY dimension (DM1.1 stands — lands in
M-D); (4) target reports R1/R2/R3 (R1 view on the Reports page lands with M2/M-D).

M18-A calls:
- **Schema**: `Project.pipelineStage` (default Exploring) + `Project.statusNote`;
  priority enum extended to `High|Med|Low|New|Strat|Paused` with a **DM1.18 tenant-loop
  backfill** remapping live rows (`Medium→Med`, `Critical→High` — verified on both
  tenants pre/post; a regression test asserts no legacy values survive). TASK priorities
  keep the docs/15 enum — only PROJECT priorities moved.
- **Pipeline table** (`src/server/pipeline.ts` + one shared component): stage groups
  with counts + blurbs; rows carry priority, derived % (checkpoint ticks replace it in
  M-D — no placeholder ticks), note = `statusNote ?? latest confirmed check-in
  narrative`, unconfirmed flag, and the six derived chips (risks, milestones w/ overdue
  marker, velocity 7d, health RAG from the engine, resources; budget returns when money
  is typed). Same component on exec (all) / PM (mine↔all toggle kept) / dev (mine, rows
  deep-link to the dev-lens board, replacing the "My boards" panel).
- **Removed from every preset**: exec KPI row, exec milestones-30d + top-risks panels
  (now chips), PM project-card grid, the interim layout's KPI tiles. No global KPI
  tiles render anywhere (§10).
- **Governance edits (§7)**: new `project:stage` permission (Executive + both Heads;
  SuperAdmin via `*`); the project PATCH route allows governance-only payloads
  (stage/priority/note) on `canWriteProject OR can(project:stage)` — wider edits keep
  the DM1.4 transitional gate. `GovernanceEditor` on the workspace Overview:
  inline/optimistic, read-only render without the gate (tested both ways); stage changes
  are audited + evented and narrated by the exec delta feed.
- **Personal board (§4)**: `/board` with To do · Doing · Done as VIEWS over the 5-status
  taxonomy (Doing wears the sub-state badge), project tabs, "added by <name>"
  attribution, SSE refetch on task events. **Completion rules**: Feature/Bug →
  QA-category members / HeadOfQA only ("QA owns Completed"); Chore/Spike/Improvement →
  direct. Lane moves emit `task.status_changed` and notify the REPORTER (never the
  mover). `/my-tasks` redirects to `/board` (old deep links keep working); its approval
  queue + PM/QA reference lists moved onto the board page; the dead my-tasks client was
  deleted. One legacy test updated: the auto-progress suite now completes via a
  QA-capable actor, honouring the new rule.

Verified: lint/typecheck/build green, 460/460 tests (64 files; new: pipeline-governance
+ board-rules RLS suites). Live on KCB: v3 exec dashboard (grouped pipeline 2/1/12 with
chips incl. STRAT priority and 0/1! overdue markers, zero KPI tiles), a real stage
change P003 Exploring→Evaluating that regrouped the table AND appeared in the delta
feed, and the personal board with sub-badges, inline blocker reason, attribution, and
the /my-tasks redirect.

## M18-B — Portfolio grouping: §0.5/§3.0 hierarchy + the amended §6 dashboard (2026-07-29)

### DM1.30 — Every project belongs to a portfolio; the dashboard groups by portfolio
Amended docs/18 (§0.5, §3.0, §6, §10) implementation calls:

- **Schema**: `Portfolio.viewKind` (`Pipeline|Rollout`, default Pipeline). **DM1.18
  tenant-loop backfill** finds-or-creates an "Unassigned" portfolio per tenant and moves
  every `portfolio_id IS NULL` project into it — verified 0 portfolio-less projects on
  both tenants pre/post, and a §10 regression test keeps it that way. `createProject`
  routes portfolio-less input to Unassigned via a **self-healing lookup** (recreates the
  portfolio if a tenant predates the seed); `getPortfolioSections` additionally folds
  any raw-inserted null-portfolio row into the Unassigned section so nothing can vanish
  from the book.
- **`getPortfolioSections`** replaces `getPipelineTable`: one section per portfolio
  carrying name, worst-of-children RAG (via the ONE health engine), Δ vs ~7-days-ago
  project snapshots, avg derived %, summed open blockers, owner, and the stage-grouped
  pipeline as its body. Sections sort **worst health first**; Unassigned renders
  **last and only when non-empty**; empty regular portfolios keep their header so execs
  see the whole book. `viewKind=Rollout` renders the pipeline lens with an honest
  "ROLLOUT · PIPELINE LENS" tag until M-D ships market tracks — never a placeholder
  heatmap.
- **Sections are collapsible** (`<details>`): Red/Amber open by default, Green starts
  collapsed — trouble is one glance, the healthy book is one click.
- **The exec org heatmap is REMOVED** (portfolio × subsidiary): its RAG+Δ signal moved
  onto the section headers per the amended §6/wireframe. The rollout heatmap returns
  per-portfolio with M-D. Exec preset is now hero → health trend → decision queue →
  portfolio sections → delta. PM/dev consume the SAME sections with scope="mine"
  (sections holding none of my projects drop out; the ALL toggle restores them —
  DM1.20 stands).
- **Portfolio move is a governance edit (§7)**: `portfolioId` joined
  `GOVERNANCE_FIELDS` (PATCH allowed on `canWriteProject OR project:stage`), validated
  (`PORTFOLIO_NOT_FOUND`), audited with before/after, editable inline from the
  workspace GovernanceEditor (select shows the portfolio NAME — explicit SelectValue
  text, since the raw value is a UUID). Moves are never-null: a project always lands in
  a real portfolio.
- **/standalone is gone** (§0.5): page + API deleted. The portfolios page's
  programme-less grid is a different concept and stays.

Verified: lint/typecheck/build green, 465/465 tests (65 files; new: portfolio-sections
RLS suite — §10 zero-orphans both tenants, create-defaults-to-Unassigned, worst-first +
Unassigned-last ordering, Rollout lens, audited move + target validation, cross-tenant
isolation). Live on KCB (exec: Risk & Compliance RED first → ambers → Customer
Experience GREEN collapsed → Unassigned last with 5; PM scope=mine filtered to P001's
section) and Riverbank (red theme, single Unassigned book, PM view, governance PATCH
with portfolioId 200 + portfolio select showing "Unassigned").

## M1c — QA preset + Implementor persona (docs/17 §5/§7) (2026-07-30)

### DM1.31 — The fifth persona ships; every persona now has a dedicated preset
- **Implementor category (§7, confirmed 2026-07-28)**: `projectRoleCategory()` gained
  `Implementor` as the fifth category; PROJECT_ROLES gained "Implementation Lead",
  "Implementor", "Trainer", "Support Analyst". No data migration (same pattern as 6.1);
  legacy free-text still lands on Stakeholder. `defaultLens(Implementor)` = "all".
- **QA preset (§5)**: sentence hero (never KPI tiles), test queue grouped per project
  with a TRIAGE-FIRST strip for unassigned CRITICAL bugs, "Bugs I raised"
  (reporter=me, severity/status/reopened), per-project quality strip (open bugs by
  severity + reopen rate, coverage joins after M8 — no placeholder). **Aging uses the
  board-lens business-day clock** (bad > 5 business days per AGING_BUSINESS_DAYS, warn
  from 3) — NOT the mockup's calendar-day constants, so the dashboard and the QA board
  lens cannot disagree. **Reopened is derived** from task.status_changed domain events
  leaving Completed — no new schema.
- **Implementor preset (§7)**: next-go-live hero with a plain-language critical-path
  sentence, open gate items, pilot/UAT list with gate segments, rollout issues (open
  Blockers), 30-day go-live calendar, handover docs (ProjectDocument PendingReview).
  **Interim data source stated in the UI**: gates = the project's milestones; the
  rollout window = milestone names matching UAT/SIT/pilot/go-live/rollout/launch/
  hypercare. M8's stage machine repoints the module; the composition doesn't change.
- **Scope toggle adopted on QA + Implementor** (design proposal №10 → DM1.20
  extension): one shared ScopeToggle component now serves PM/QA/Implementor.
- **isMine scoping fixed while verifying**: getPortfolioSections counted only PM-role
  members, so a QA/Dev/Implementor member saw "none of your projects". isMine is now
  lead-or-member-in-ANY-role, per §6 "rows the viewer is a member of".
- **Interim preset retired** (§8 complete): InterimPreset, TodaySection/AtRiskSection,
  portfolio-heatmap component, /api/dashboard/heatmap and getHeatmap all deleted;
  dashboard-v2 slimmed to the shared engine surface + the health-parity contract.
  Marketing copy no longer sells heatmaps.
- **Seed**: per-tenant synthetic qa.demo@/impl.demo@ members (on the .invalid domain)
  with triage/raised-bug/UAT-milestone/handover fixtures so both personas demo out of
  the box on both tenants.

Verified: lint/typecheck/build green, 471/471 tests (66 files; new: dashboard-qa-impl
RLS suite — triage-only-unassigned-critical, business-day aging, Completed→reopened
derivation incl. QA-owns-Completed, interim rollout window, cross-tenant isolation; the
M1b team-load test was hardened to assert real membership sharing instead of assuming
the fixture pair). Live on KCB (QA: triage strip, aging clock note, quality bars;
Implementor: go-live hero "8 of 15 gate items open", pilot 7/15 segments, calendar,
handover pack) and Riverbank (both personas, red theme).

## M2-B — Member weekly report: compose → submit → acknowledge (docs/18 §5.1/§5.2) (2026-07-30)

### DM1.32 — One report per member per week, acknowledged per project
- **Shape**: ONE `MemberReport` per member per ISO week (`Draft|Submitted|Acknowledged`)
  whose `draft` JSON carries a section per project, plus one `MemberReportAck` row per
  project lead who signs off. §5.1.3 says a multi-project member submits one report and
  each PM sees their project's section — that shape follows directly, and it keeps
  "who acknowledged what" as data rather than a status guess. Both tables carry
  tenant_id under FORCE RLS; no backfill, so no DM1.18 loop.
- **Drafting is automatic; SENDING never is** (§5.1.2). `friday-member-drafts` builds a
  draft from the member's OWN board (done this week, still-in-flight with board-lens
  business-day aging, blockers raised/resolved) and notifies them. A member with no
  tracked movement gets NO draft — an empty report is noise, and it would trigger a
  Monday nudge for nothing.
- **The client can never rewrite the facts**: `saveMyReport` accepts only narrative,
  per-project notes and the (editable) summary lines; done/doing/blocker facts are
  recomputed server-side and preserved.
- **Acknowledgement is resource-scoped**: only a lead/PM of THAT project, only for a
  section the report actually carries. The report flips to `Acknowledged` only when
  every section it holds has been signed off — a partially-acknowledged report stays
  Submitted, which is the honest state.
- **Rollup (§5.1.4)**: acknowledged sections feed `computeCheckInDraft`, so the PM's
  check-in carries what their team told them without re-typing. ACKNOWLEDGED only — an
  unread report is not yet the PM's word.
- **Monday chase (§5.1.5)** joined the existing `checkin-chase` job as a second signal
  (`member_report_unsent`) rather than a new cron entry: one Monday sweep, same weekly
  dedupe, no crontab change on the box.
- **Reports page (§5.2)** became four tabs: **Status (R1)** — live portfolio/project
  status, globally readable, rendered from `getPortfolioSections` so it can never drift
  from the dashboard; **My weekly report** (composer); **Team reports** (lead's
  acknowledge queue); **Generate** (the existing Q builder, scoped pulls still gated by
  `canAccessReport`). R2/R3 market matrices arrive with M-D.
- **Found by live verification, fixed**: the lead's view rendered section lines but not
  the member's own narrative — the "anything else your lead should know?" answer never
  reached anyone. `TeamReportRow` now carries `narrative` and the UI shows it; the RLS
  test asserts it.
- **Test-fixture hazard recorded**: `ensureUsers` REUSES seeded accounts, so its first
  user is the tenant super-admin (holds every permission, already on the demo project).
  Suites whose meaning depends on clean actors now use the new `createUsers` helper.
  Four failures in this milestone traced to that, not to product code.

Verified: lint/typecheck/build green, 481/481 tests (68 files; new: member-reports RLS
suite covering own-board drafting, multi-project routing, cross-project acknowledgement
denial, the check-in rollup, §10 permission both ways, tenant isolation + a pure
line-builder unit suite). Live on KCB: `friday-member-drafts` drafted 1 and correctly
skipped 2 empty weeks per tenant, a member composed and sent, the lead saw the narrative
and acknowledged, and the notifications landed (drafted → submitted → acknowledged).

## M-D-A — Delivery checkpoints as data + markets as a kind of org unit (docs/18 §2/§3.1) (2026-07-30)

### DM1.33 — Gates are templates, % is derived, markets are org units
M-D is large, so it ships in two halves: **M-D-A** (this entry) puts the data and the
edit surface in place; **M-D-B** adds the rollout heatmap, the project×market drill-down
and the R2/R3 report views.

- **Checkpoints are DATA (§2)**: `CheckpointTemplate` → ordered `Checkpoint` list; a
  project picks one via `Project.checkpointTemplateId`. `CheckpointStatus` is keyed
  (project, checkpoint, orgUnit) where **orgUnitId NULL = the project's own track**
  (pipeline lens) and a set orgUnitId is a market track (rollout lens, M-D-B). Postgres
  treats NULLs as distinct, so the project-level row is pinned by an explicit **partial
  unique index** — the composite unique alone would have allowed duplicates.
- **% complete is DERIVED and never typed (§2)**: Done = 1, InProgress = 0.5,
  **Blocked and NotStarted = 0**. A blocked gate is honest about being stuck rather than
  half-credited; the difference lives in the state, never smuggled into the number.
  `avgProgress` now takes an optional checkpoint map and prefers it, falling back to the
  per-subsidiary rollup for ungated projects — so nothing drops to 0% on the way in.
- **Blocked demands a real open blocker on THIS project** (the task flag pattern), and a
  checkpoint from another template is refused.
- **Pipeline rows show gate ticks** instead of the bare bar when a template is attached;
  every tick carries an aria-label, so colour is never the only channel (16 §11).
- **Markets (§3.1)**: `OrgUnit.kind` = `Internal | Market`, defaulting to Internal so
  existing subsidiaries are untouched. The seven markets belong to the **Riverbank**
  tenant; DM1.1 stands because the Subsidiaries nav keys on Internal units only.
- **Migration-seeded reference data must also be seeded by seed.ts.** The migration
  creates the two templates and the markets for tenants that already exist, but
  `prisma db seed` wipes and recreates tenants — so without a matching path in seed.ts a
  reseed would leave every tenant with no templates and Riverbank with no markets. Both
  are now created in both places, and `resetTenant` clears the checkpoint tables (they
  hold a RESTRICT tenant FK). Two live failures traced to exactly this.
- **`prisma format` silently dropped an `@map`** when it reordered the new relation
  block, so `checkpointTemplateId` looked for a camelCase column and every project write
  failed with P2022 while psql showed the column present. Re-checking the formatted
  schema after `prisma format` is now part of the loop.

Verified: lint/typecheck/build green, 492/492 tests (70 files; new: checkpoints RLS
suite — template seeding per tenant, derived % reaching the dashboard with ordered
ticks, Blocked-needs-a-blocker both ways, cross-template rejection, audit + event,
market counts per tenant, cross-tenant isolation — plus a pure derived-% unit suite).
Live on KCB (gate matrix at 42%, a real MVP1 Done → 50% with the exec row's ticks
updating, Blocked without a blocker refused with the plain-language reason) and
Riverbank (same template attached, seven Market org units, both templates listed).

## M-D-B — Rollout lens: project × market heatmap, market check-ins, R2/R3 (docs/18 §3/§6) (2026-07-30)

### DM1.34 — The rollout lens ships; M-D is complete
- **`MarketCheckIn`** (project × market × ISO week): one narrative paragraph of focus &
  blockers plus a RAG. Mirrors the project `CheckIn` rather than extending
  `ProjectOrgStatus`, because a check-in is inherently per-week while the track is not.
  The track's **% stays derived** from that market's own `CheckpointStatus` rows —
  this model carries only what a human must say.
- **A track exists when a `ProjectOrgStatus` row exists** for that project × market
  (§3.1: reuse the model, don't duplicate it). A market a project does not ship into
  renders **"—", never 0%** — an absent track and a stalled one must not look alike.
- **Roll-ups run bottom-up through the ONE health engine** (§3.0): market-track RAG →
  project row (worst-of) → the portfolio section header. A market check-in's RAG
  **outranks** the track's stored status for that week, because it is the human's word.
- **One encoding per cell** (17 §2): RAG dot + Δ arrow only; % and gate counts live in
  the tooltip and the aria-label, so colour is never the sole channel (16 §11).
- **The interim "ROLLOUT · PIPELINE LENS" chip is gone.** A Rollout portfolio now
  renders the real heatmap, and one with no market tracks yet falls back to the pipeline
  lens labelled "NO MARKET TRACKS YET" rather than showing an empty grid.
- **Drill-down** (`/projects/:id/markets/:orgUnitId`): that track's checkpoint matrix
  plus the focus & blockers card — the "Where We Are" and "Critical Focus" slides as one
  live page, reached by clicking a cell. The check-in editor rides the §7 governance
  gate; without it the card is read-only.
- **R2 and R3 joined the Reports page** (§5.2) rendered from `getRolloutMatrices`, the
  same engine the dashboard uses, so the two cannot drift. R1/R2/R3 are all global read.
- **Seed**: Riverbank gained one `Rollout` portfolio whose first three products carry
  market tracks with per-market gate states, so the lens demos out of the box. KCB has
  no Market org units, so its rollout portfolios correctly render no columns.
- **Test-teardown note**: `ProjectOrgStatus`'s project FK does not cascade (the seed's
  reset clears it explicitly for the same reason) — suites creating market tracks must
  delete them before the project.

Verified: lint/typecheck/build green, 498/498 tests (71 files; new rollout RLS suite —
per-cell derived %, null-not-zero for unused markets, worst-of roll-up, check-in RAG
overriding + audit + event, drill-down gates and Internal-unit rejection, cross-tenant
isolation). Live on Riverbank: the Market Rollout section renders 3 products × 7 markets
with the derived summary row (83/44/32/19%) and the top-blockers strip, a cell opens the
Kenya track at 69% derived, a market check-in saved and appeared in both the heatmap and
R3, and an empty narrative was refused.

## M8-A — Gate checklists (soft-block + audited override) + lessons learned (docs/16 §6) (2026-07-30)

### DM1.35 — Gates state their requirements, soft-block, and record every override
M8 is XL, so it ships in thirds: **M8-A** (this entry) governs the gates; **M8-B** is the
document register (types, versions, review workflow); **M8-C** is AI ingest →
`Requirement` with source anchors + traceability coverage.

- **Rules are keyed off the CHECKPOINT NAME**, not a hardcoded stage enum, because
  checkpoints are per-template data (docs/18 §2). A template nobody wrote rules for has
  none and its gates close freely — governance is opt-in per gate, not a wall.
- **Checkable today, from live data**: an approved BRD in the register + lead and members
  allocated (BRD / Business Case); published tasks and milestones (MVP1 / Solution
  Build); zero open Critical bugs (SIT / UAT / Testing / Pilot); lessons captured + an
  approved handover doc (Go-Live / Rollout / Closure).
- **Rules that cannot be enforced yet are ABSENT, not stubbed.** Requirement coverage ≥
  threshold (docs/16 §6) needs M8-C's `Requirement` model; a rule that always passes is
  worse than no rule because it teaches people the checklist is theatre.
- **Soft-block per §6**: closing a gate with unmet requirements is allowed but needs a
  written reason (≥5 chars). The reason, the actor and the timestamp are stamped on the
  `CheckpointStatus` row, audited, and carried on the domain event — an override is
  visible forever, and the UI badges the gate "OVERRIDDEN". Satisfying the requirements
  later and re-closing clears the override rather than leaving a false scar.
- **The API answers 409, not 400**, for an unmet gate: the request is well-formed, the
  gate simply isn't satisfied. The response carries the unmet rules so the UI lists them
  and offers the override inline instead of failing flat.
- **`LessonLearned`** (docs/16 §6, a direct stakeholder ask) is captured as the project
  runs — any project member may record one, because the people who lived the work know
  the lesson — and the closure gate requires at least one.
- **A behaviour change caught by the existing suite**: M-D-A's checkpoint tests began
  failing because closing BRD is now governed. Rather than weaken the gate, the fixture
  was given what the rule asks for (an allocated member and a Final BRD) — the suite's
  intent was the derived-% maths, not ungoverned gates.

Verified: lint/typecheck/build green, 505/505 tests (72 files; new gate-rules RLS suite —
rules surfaced before anyone closes a gate, Done refused with the unmet list, rules-free
gates closing freely, override stamped + audited + evented, satisfying requirements
clearing the override, lessons gating closure, cross-tenant isolation). Live on KCB: the
seeded P001 evaluated all six gates correctly against real data (BRD needs its document,
SIT/UAT blocked by the seeded Critical bug, Go-Live needs lessons + handover), a
too-short override reason was refused, a proper one closed SIT and badged it OVERRIDDEN,
and recording a lesson flipped `lessons-captured` to met.

## M8-B — Document register: types, versions, named-approver review (docs/16 §6) (2026-07-31)

### DM1.36 — Approval is a decision by named people, not a status flip
- **Status vocabulary moved** to `Draft → InReview → Approved | Rejected`, replacing
  `Draft | PendingReview | Final`. Live rows were remapped inside a **DM1.18 tenant
  loop** (PendingReview → InReview, Final → Approved) — verified pre/post on both
  tenants with zero legacy values left, and a regression test asserts it stays that way.
- **Named approvers (§6)**: submitting a document names who must approve it, and ONLY
  those people can decide. The rule lives in `recordDecision`, not the route, so it
  holds for every caller. The author is not implicitly an approver; neither is anyone
  who merely has project access. Verified live: a non-approver gets 403.
- **Every named approver must approve** for the document to reach Approved; **one
  rejection sends it back** rather than leaving it half-approved. Re-submitting after a
  rejection **clears the previous decisions** — a fresh review, not a half-remembered one.
- **Versioning supersedes, never overwrites**: `newVersion` creates the next version
  linked to its predecessor and starting as Draft, while the approved v1 stays readable
  and is marked superseded. Submitting an already-approved document is refused with
  "raise a new version instead" — the approved history is not editable in place.
- **The register's types are real** (`BRD | URS | SRS | Design | TestPlan | Signoff |
  Handover | Plan | Note | Other`). M8-A's gate rules read the new vocabulary: an
  approved BRD satisfies the planning gate and an approved **Handover** document
  satisfies the closure gate — replacing the title-substring approximation, which stays
  only as a fallback for documents filed before the types existed.
- **Documents now enter the register as drafts.** The old default filed everything as
  Final, which quietly asserted approval nobody had given.
- **Five test fixtures across four suites** used the old vocabulary and failed as
  designed; each was updated to the new words rather than the gates being weakened.

Verified: lint/typecheck/build green, 514/514 tests (73 files; new document-register RLS
suite — draft-by-default, submission naming approvers and notifying them but not the
submitter, named-approvers-only enforcement both ways, unanimity, rejection sending back
and re-submission clearing decisions, versioning superseding, the gate rule reading the
register, cross-tenant isolation). Live on KCB: a Handover document created, submitted to
a named approver, a decision by a non-approver refused with 403, the approver's approval
flipping it to Approved, and the Go-Live gate's `handover-approved` rule turning met.

## M8-C — Requirements, AI ingest behind a human gate, traceability coverage (docs/16 §6) (2026-07-31)

### DM1.37 — Extraction proposes, a human accepts, and coverage names the anchor
This completes M8 (A: gates · B: register · C: requirements).

- **Never auto-apply (§6, the P0 from the improvement notes).** `extractCandidates`
  reads a BRD/URS and returns CANDIDATES — it writes nothing, and there is no code path
  that turns a read into a requirement. Only `acceptCandidates`, carrying what a person
  ticked on the "Q found this in your document" screen, creates rows. Verified live with
  the real AI path: after a read, the project still had zero requirements.
- **Every requirement keeps its SOURCE ANCHOR** (document + section). That is what lets
  coverage say "§3.2 has no covering task" instead of publishing a percentage nobody can
  act on — the uncovered list names each anchor, and the panel leads with it.
- **Two extraction paths, one contract.** With the Q AI box configured, the LLM reads the
  document; without it, a deterministic parser keeps the nearest heading as the anchor and
  takes must/shall/should lines. The feature works without an LLM rather than failing
  shut, and the parser is unit-tested so its behaviour is pinned rather than incidental.
  A document with no text is refused outright — better than inventing requirements.
- **Coverage = accepted requirements with at least one PUBLISHED covering task.** A Draft
  (AI-proposed, unapproved) task proves nothing and does not count. A task from another
  project is refused as evidence.
- **The pilot gate now enforces coverage ≥ 80%** (docs/16 §6 "≥ threshold"), retiring the
  rule M8-A deliberately left absent. **A project with NO requirements passes** — the gate
  asks about coverage, not about whether the team uses requirements at all. Blocking an
  empty set would punish teams for a practice they never adopted.
- **The QA preset's "requirement coverage joins after M8" placeholder is gone**, replaced
  by the derived number from the same engine the gate reads.
- **Tooling note:** running `npx prettier` on a source file reformatted it wholesale (the
  repo has no prettier config), turning a 15-line change into a 145-line diff. Reverted
  and edited by hand. Don't reach for prettier here.

Verified: lint/typecheck/build green, 526/526 tests (75 files; new requirements RLS suite
— read-writes-nothing, empty-document refusal, anchors preserved on accept, coverage
naming uncovered anchors, draft-tasks-aren't-coverage, cross-project evidence refused,
the gate + QA strip reading one number, empty-set passing, tenant isolation — plus a
parser unit suite). Live on KCB: a URS filed, Q proposed 3 requirements with §3.1/§3.2
anchors while persisting none, two accepted as REQ-001/REQ-002, a published task linked,
and coverage moved 0% → 50% with the UAT gate reporting "50% of 2 requirements have a
covering task".

## M6-A — Absence-aware capacity: leave lowers capacity and silences nudges (docs/16 §5) (2026-07-31)

### DM1.38 — One absence table, and every surface that should react does
M6 is L-sized, so it ships in halves: **M6-A** (this entry) makes the system know who is
away and react; **M6-B** adds the CSV/ICS bridge, dated allocations, assignment warnings
with suggested alternates, the Friday exposure line, and the TimeEntry retarget.

- **`Absence` is source-agnostic by design** (userId, type, start/end, `source`,
  externalRef). Manual entry ships now; a CSV/ICS import and a read-only ERP pull attach
  later without a schema change. The ERP stays the system of record — QUBIT never writes
  leave back to it.
- **Capacity is leave-aware, and BOTH numbers are kept.** `totalPct` is what somebody is
  booked to; `effectivePct` scales it by the working days they are actually available
  over the coming fortnight. Somebody away all fortnight reads 0% effective, not "100%
  allocated". Overlapping absences are unioned by day, so stacked leave cannot drive
  availability negative, and weekend-only leave costs nothing.
- **The nudger reroutes rather than drops.** An absent person is never pinged — that is
  how you teach a team to ignore nudges (§5) — but the nudge is not lost: it goes to the
  project's PM instead, because the thing still needs doing. If the PM is also away, the
  remaining present recipients keep it.
- **Writes are gated on `iam:manage` or `project:update`**; reading is open within the
  tenant, because every surface that reacts to leave needs it and a colleague's absence
  is not sensitive internally. Only `manual` rows can be deleted — imported and ERP rows
  belong to their source.
- **Found by its own test**: `createAbsence` accepted a backwards date range because the
  refinement lived only on the route's Zod schema. The invariant moved INTO the engine,
  matching the rule M8-B established for approvers — a route-only guard is one import
  away from being bypassed.
- **Operational note**: I deleted `.next` while the dev server was running, which broke
  it with ENOENT build-manifest errors. Stop the preview server before a clean build.

Verified: lint/typecheck/build green, 542/542 tests (77 files; new absence RLS suite —
manual entry audited, backwards range refused at the engine, capacity dropping to 0
effective while the typed allocation stands, nudge suppressed for the absent person and
rerouted to the PM, imported rows undeletable, tenant isolation — plus a pure capacity
unit suite covering weekends, clipping, unioned overlaps and the never-negative floor).
Live on KCB: leave recorded through the API, a backwards range refused with 400, and the
PM team-load showing "ON LEAVE UNTIL 8 AUG" against the right person.

## M6-B — Absence reactions: assignment warnings, exposure line, CSV bridge (docs/16 §5) (2026-07-31)

### DM1.39 — Absence changes decisions, not just numbers
M6-A made the system know who is away; M6-B is where that knowledge changes what
somebody does.

- **Assignment warning (§5)**: assigning a task due inside the assignee's leave returns
  a warning naming when they are back and up to three alternates — SAME project role,
  present that day, least loaded first. It is a **warning, never a block**: the update
  succeeds and the caller is told, because the PM may know something the leave calendar
  does not.
- **Friday exposure line (§5)**: the weekly report now carries "N people are on leave
  next week" plus the projects losing the largest share of their team. It counts
  **people, not percentages of an allocation nobody typed** — the honest figure with the
  data we actually have.
- **CSV file bridge (§5 adapter mode 2)**: `email,type,start,end[,ref]` from any ERP
  export, no API call needed. **Idempotent on externalRef** so re-running an export
  corrects dates in place instead of stacking duplicates. A malformed row is rejected
  **with a reason and a 1-based line number** while the rest still import — one bad line
  must not cost you the file. Unknown people are surfaced, not swallowed.
- **Deferred from M6, with reasons**: dated allocations
  (`ProjectMember.startDate/endDate`) and the `TimeEntry`→`ProjectTask` retarget are
  mechanical and independent of the absence layer; the ERP API pull waits on the
  endpoint being provisioned (docs/14). None of them block the §5 payoff.

**A contamination lesson worth recording**: three M3 nudger tests failed after M6-A
because my own live browser verification had booked a *seeded* user off, and
`ensureUsers` reuses seeded accounts — so the nudger's assignee looked absent and the
reroute fired. The product was right; the suite simply no longer controlled a
precondition that now matters. The nudger suite now clears absences for its own actors.
Live verification against the shared dev database can change later test runs.

Verified: lint/typecheck/build green, 551/551 tests (79 files; new reactions RLS suite —
warning fires only inside the window, alternates respect role and exclude anyone also
away, exposure counts, CSV idempotency and per-row rejection, cross-tenant invisibility
— plus a pure CSV-parser unit suite). Live on KCB: leave booked, a task assigned into
that window returned `conflict: true` with the return date, and the generated Friday
report read "1 person is on leave next week · CBS Phase 1 loses 1 of 3 (33%)".

## M5 — Email: digest-first, Graph adapter, per-user routing (docs/16 §8) (2026-07-31)

### DM1.40 — One digest beats twenty notifications, and a mail outage is never a lost mutation
- **Digest-first is the default, in code.** `DEFAULT_CHANNELS` in
  `src/server/mail/preferences.ts` is the single source of truth; a
  `NotificationPreference` row exists ONLY when somebody changed their mind. The default
  can therefore evolve for everyone without a migration, and "what happens if I do
  nothing" has one answer rather than one per user. Resolution is
  explicit-kind → the user's catch-all → the code default.
- **Only time-critical kinds mail immediately**: `nudge` (a nudge that arrives tomorrow
  has already failed) and `weekly_report`. Mentions and task updates batch; `checkin_ready`
  never leaves the bell. Emailing every mention is how people mute a tool.
- **A failed send is never a failed mutation.** `Mailer.send` resolves with an outcome
  instead of throwing, so a mail outage cannot roll back a check-in, a report or an
  approval. Delivery is best-effort; the in-app bell stays the reliable channel.
- **The digest job is idempotent by construction**: it collects only
  `emailedAt = null` rows and stamps them in the same run, so a re-delivered cron hit
  sends nothing twice. A FAILED send deliberately leaves the stamp unset so tomorrow
  retries — a bounced digest is not a delivered one. In-app-only rows are stamped too:
  they were considered and deliberately not sent, and should not be reconsidered nightly.
- **Two adapters, one contract**: Graph/M365 client-credentials `sendMail` when
  `FEATURE_EMAIL` is on AND all four credentials exist; otherwise a log adapter that
  records what it would have sent. Every other code path behaves identically either way,
  so the feature is testable and demoable with no mailbox.
- **Templates are tenant-branded** (KCB green, Riverbank red — docs/08's rule holds in
  email too), table-free inline CSS with a real plain-text alternative, and **all
  user-supplied text is escaped**: a notification message contains whatever somebody
  typed into a task title. The weekly-report email is a LINK, never a copy — depth lives
  in the app (docs/17 §6).
- **Preferences are always the caller's own**: no userId in the path, so nobody can
  reroute a colleague's mail. The API reports `emailEnabled` so the UI can say "email is
  off for this deployment" instead of pretending a Digest choice sends something.
- **Ships with the flag OFF in production** — it stays off until M365 credentials are
  provisioned. The job runs harmlessly against the log adapter until then.

**A test-coupling note**: the digest suite first asserted a GLOBAL send count from a job
that processes every pending notification in the tenant, and failed once on a full-suite
run before passing on re-run. Rather than shrug at a flake, the assertions now check the
fixture user's own outcome (his three rows stamped, two mailed in one email). Suite-order
coupling is a real defect in a test, not noise.

Verified: lint/typecheck/build green, 560/560 tests (81 files; new digest RLS suite —
channel resolution precedence, one-email-per-person batching, never-twice stamping,
flag+credentials gating, tenant isolation — plus a template unit suite covering brand
colour, pluralisation, HTML escaping and link-not-copy). Live on KCB: three pending
notifications produced exactly ONE digest ("QUBIT: 2 updates for you" to Daniel) with the
`checkin_ready` row correctly left in the bell, and a second run sent nothing.

---

## DM1.41 — Task dependencies refuse cycles at write time, and the board says what is waiting (M7-A)

`ProjectTaskDependency` records "this task waits on that one". Two rules carry the weight:

- **Acyclic, enforced on write.** A `CHECK (task_id <> depends_on_task_id)` stops the
  trivial case in the database; the transitive case is walked in `wouldCycle()` before
  every insert. A loop is a set of tasks none of which can ever start — leaving it for a
  report to notice later would mean the graph is already wrong by the time anyone looks.
  The walk is pure and separately unit-tested (direct, transitive, long chain, diamond,
  and a graph that already contains a cycle, which must terminate rather than hang).
  A refused cycle answers **409**, not 400: the request is well-formed, the graph simply
  cannot accept it.
- **Same project only.** A cross-project dependency hides coupling the portfolio view
  cannot show, and every scheduling question it raises is really a programme question.
  Refused with a message that says so.

The board renders a "waiting on N" chip whose tooltip names the blockers, so nobody starts
work that cannot move. **"Waiting" counts only INCOMPLETE blockers** — once the blocker is
Completed the chip drops off, but the edge is kept: history is not rewritten, only the
`blocking` flag flips.

---

## DM1.42 — YouTrack issues are MIRRORED onto ProjectTask, read-only, inbound only (M7-C)

QA, developers and implementors file their work in YouTrack. QUBIT's job is reporting, so
it has to read from where the work actually happens.

- **Mirror into `ProjectTask`, not a parallel table.** Every surface that reports on
  progress already reads `ProjectTask` — project %, the pipeline table, personal boards,
  QA dashboards, member weekly reports, requirement coverage. A separate `ExternalIssue`
  table would have meant rebuilding all of that a second time. Mirrored in, a bug filed in
  YouTrack moves the project's RAG on Friday with nobody retyping anything.
- **`externalKey` is NOT `taskKey`.** YouTrack's `RBC-123` lives in its own column. The
  `taskKey` space is `<project.code>-<n>`, allocated from `ProjectTaskCounter` and parsed
  by commit automation; letting a tracker key into it would collide two namespaces that
  must stay separate. Mirrored rows carry no `taskKey` at all.
- **Read-only for the fields the tracker owns** (title, description, status, type,
  priority, severity, assignee, due date). A local edit is REFUSED with a message naming
  the issue to change instead. The alternative — accepting the edit — would silently
  revert it at the next sync, which is worse than saying no. Deleting a mirrored task is
  refused for the same reason. QUBIT keeps owning the governance layer on top: milestone
  links, requirement links, dependencies, blockers, comments, checkpoint gates.
- **A connected project refuses NEW native tasks** (Joyce's call: YouTrack-only). Tasks
  created before the connection stay visible and editable; only new ones are blocked, and
  the board hides its own add/generate controls rather than letting the refusal be
  discovered by trying. The known cost: PM-level chores and action items have nowhere to
  live in QUBIT on a connected project. Reversible by flipping one guard.
- **Inbound only.** Nothing writes back to YouTrack, so the token needs read scope alone.
- **Rejected resolutions map to Completed.** "Won't fix"/"Duplicate"/"Declined" are not
  delivered work, but they are not outstanding work either, and QUBIT's taxonomy has no
  Cancelled status — leaving them open would permanently depress every project's progress.
  Overridable per project, like every other mapping.
- **The field mapping is per-project and defaults are a courtesy, not an assumption.**
  YouTrack workflows are configurable, so no built-in map is right everywhere. Unknown
  states fall back to the `resolved` timestamp — the one signal YouTrack guarantees
  whatever the workflow looks like.
- **No phantom users.** An assignee matches a QUBIT user by email INSIDE the tenant (RLS
  makes another tenant's account invisible, so a shared email can never cross over); an
  unmatched one is kept as a display name and reported in the sync result, so the gap is
  visible rather than silently unassigned.
- **The network call happens outside every transaction**, and writes go in chunks of 100.
  Holding a Postgres transaction open across a third-party round trip would pin a
  connection for the length of the sync, so `JobDefinition` grew a `NetworkJobDefinition`
  variant that receives a `TenantContext` instead of a `tx` and opens its own short
  transactions. DM1.18 is unchanged: every read and write still happens inside `withTenant`.
- **Audit is honest, not noisy.** A row per created task, a row per task whose owned
  fields ACTUALLY changed, plus one summary row per run. A no-op sync writes none — which
  is also the test that proves idempotency.
- **SSRF guard on the instance URL** (`docs/11` / OWASP). The base URL is customer-supplied
  config, so without a guard this connector forwards requests anywhere: https-only, no
  embedded credentials, and the resolved address must be public unless the host is named in
  `INTEGRATION_ALLOWED_HOSTS` — which is how a self-hosted YouTrack on the corporate
  network is permitted deliberately rather than by accident. Redirects are refused, closing
  the common rebind vector. **Residual risk stated rather than implied**: a DNS rebind
  between the check and the fetch is still possible; pinning the resolved IP to the socket
  would close it and is deferred.
- **`lastSyncAt` advances only on success.** A failed run must re-read the same window next
  time, not skip past issues it never saw. The failure message is stored on the integration
  row and shown in the panel, so a silently dead integration is visible instead of stale.
- **Ships with `FEATURE_YOUTRACK` OFF.** No instance is connected yet; the job is a no-op
  until a token and URL are configured.

**Verified**: lint/typecheck/build green, 627/627 tests (85 files). Browser-checked on both
tenants with a throwaway `YTDEMO` fixture (since removed): five mirrored issues rendered
with their `RBC-…` keys linking out, the status picker replaced by "Status is set in
YouTrack", the add-task box replaced by "Issues are raised in YouTrack and appear here at
the next sync", an unmatched assignee shown by name, progress reading 1/5 · 20% from
mirrored rows alone, and the M7-A "waiting on 1" chip correct (two edges declared, the
Completed one dropped). The SSRF guard was exercised live: `http://169.254.169.254` refused
for scheme, `https://169.254.169.254` refused as a private address.

**Not done, deliberately**: the sync emits no notifications and no domain events. Mirroring
a few hundred issues would otherwise fire a wave of bells on first connect. Assignment
notifications from YouTrack are a follow-up, not an oversight.

---

## DM1.43 — Role-scoped project boards: PMs see everything, disciplines see their lane (M7-D)

**Supersedes the visibility half of DM1.3/DM1.20** ("the personal board is the default
view, never a wall"). Per Joyce (2026-07-31): everyone gets read-only project boards fed
by YouTrack; PMs see all tasks across the project and keep the lens toggles; everyone
else sees only their own board. The wall is now deliberate.

- **A task's lane is decided by WHO it is assigned to** — the assignee's project-role
  category — not by task type or phase. This is the one signal that survives YouTrack
  mirroring (a mirrored issue has no phase/ownerRole, but its assignee has a project
  role). "A task assigned to Trevor (a dev) lands on the Dev board." Fallbacks for work
  with no categorised assignee: unassigned bugs → QA (triage), everything else → Dev, so
  nothing vanishes. PM/stakeholder-assigned work lives on the "all" lane only.
- **Lenses are role-locked**: PM → all four (All / Dev / QA / Implementor, plus Mine);
  Dev/QA/Implementor → exactly their lane, toggles collapse to a label; stakeholder
  project roles (Sponsor, Business Owner, Product Owner, BA) → the whole board read-only,
  because they need the full picture and can act on none of it.
- **Enforced in the API, not the component**: `/api/projects/[id]/tasks` filters rows
  through the same pure `taskVisibleTo()` the client uses, with the viewer's category
  computed by ONE shared function (`viewerBoardCategory`) used by both the page and the
  route — the toggles rendered and the rows returned can never disagree. A rule enforced
  only in the client is not a rule.
- **Assigned-to-me always wins**: a person can never be blind to their own work,
  whatever lane the card would otherwise sit in.
- **Progress stays whole-project.** A dev who sees 2 cards still sees the project at its
  real %. Scoping the denominator per persona would give every role a different
  "project progress" and hollow out the single health engine.
- **Write follows the same shape** (`canWriteTask`, tightened): the old "any member may
  write any task" fallback is gone. Write = PM roles/lead, the ASSIGNEE for their own
  task (the personal-board flow), and QA members within QA scope (InReview/InQA/Bug) —
  kept because QA owns Completed for Feature/Bug (docs/18 §4) and by definition doesn't
  own the task it verifies. Governance stays member-open: blockers, comments,
  dependencies are QUBIT-owned facts YouTrack doesn't hold, and a dev who can't raise a
  blocker means blockers arrive second-hand or not at all. Task CREATION also stays
  member-open on native projects (DM1.11); YouTrack-connected projects already refuse it.
- **Onboarding declares ONE group** — exec, pm, or member(dev/qa/implementor) — single
  choice in the invite and edit dialogs, `.max(1)` in Zod. The choice constrains what an
  admin DECLARES; derived groups still union in at login (a declared dev who leads a
  project still derives `pm`), which is the existing docs/17 §1.1 machinery and correct.
  Rows saved under the old multi-select rule stay valid and collapse on next edit.
- **Project onboarding states where the role lands**: the member-add picker requires a
  role (button disabled until chosen) and shows "Developer → Dev board" at the moment of
  choosing, rather than letting someone discover a locked lens later.

**The accepted trade, stated**: QA can no longer watch the Dev board to see what is
coming toward them, and a discipline member cannot see a neighbouring lane at all. If
that bites, the fix is a targeted read grant (QA → Dev lane), not reopening everything.

**Verified**: lint/typecheck/build green, 641/641 tests (86 files; new `board-scope` RLS
suite — viewer categorisation, the dev/QA walls against real rows, assigned-to-me
override, write refusals and the QA carve-out — plus the lens unit suite rewritten for
lane-by-assignee). Browser-checked on KCB: qa.demo saw a single "QA board" label with
only the triage bug and whole-project progress (1/6 · 17%); Daniel (lead) saw all four
toggles + Mine and every card; the invite wizard's Dashboard group collapsed to
Executive / PM / Member→(Developer/QA/Implementor) with a live landing chip. One
pre-existing suite (`project-contribution`) asserted the superseded member-writes-any
rule and was updated to assert the new rule instead of weakening the gate.

---

## DM1.44 — GitHub commit automation: signed webhook, commit grammar, links + transitions (M7-B)

Implements docs/15 §6.3. Commits reference tasks by key and QUBIT reacts — the board
stops being something developers update *about* their work and starts being updated *by*
their work.

- **The grammar is the contract** (`github-commit-grammar.ts`, pure, table-tested):
  `KEY #progress` → InProgress; `KEY #done` / `fixes KEY` / `closes KEY` → **InReview,
  never Completed** — QA owns Completed (docs/18 §4) and a commit is a claim, not a
  verification. `KEY #blocked <reason>` opens a linked Blocker owned by the matched
  committer (ownerless when unmatched — a sentinel can't hold a real FK). Bare `KEY`
  links the commit and nothing else. Blocked > done > progress > mention when one
  message says several things about the same key.
- **Trust order in the webhook**: the HMAC (X-Hub-Signature-256, timing-safe, over the
  RAW bytes) is checked against a **per-integration secret** — minted at connect time,
  stored encrypted, plaintext shown exactly once. Reading `repository.full_name` out of
  the body first is pure data extraction to FIND that secret; nothing is acted on until
  the signature passes. Tenant routing comes from OUR stored `resource`, never the
  payload — a forged payload naming tenant B's repo authenticates against tenant B's
  secret alone. Proven by test: a same-key task in the other tenant is untouchable.
- **Replays are recorded no-ops** via `WebhookDelivery` (unique provider+deliveryId) —
  GitHub redelivers on timeouts; same idempotency shape as JobRun.
- **Transitions ride the existing engine** (`updateTask` / `flagTaskBlocked`), so audit,
  lastActivityAt and notifications fire exactly like a human move. The audit actor is
  the tenant user matched by verified commit author email, else the `github-sync`
  sentinel. Illegal moves (Completed stays Completed; a status the task already has) are
  ignored and counted — GitHub only retries on errors, so errors are never the answer.
- **The M7-C seam**: commits may reference a YouTrack key (`RBC-123`) on a mirrored
  issue — it LINKS (traceability) but never moves; YouTrack owns status. QUBIT taskKeys
  and tracker externalKeys are matched as separate namespaces, both scoped to the
  integration's own project.
- **Machine routes left the auth middleware**: `/api/webhooks/*` and `/api/internal/*`
  are excluded from the session matcher — their own guards (HMAC, CRON_SECRET) are the
  real authentication, and the old behaviour (a login redirect answered to a webhook
  POST) was a latent bug for the cron route too.
- **Board reward**: cards show a linked-commit count chip — the visible payoff that
  makes the grammar worth using.
- **Deferred, stated**: the polling fallback for repos that can't add a webhook (spec
  §6.3) — the seam is ready (same parser), no such repo exists yet. Q's `github_status`
  commit lines ride later. Rate limiting per integration is deferred; the 1 MB body cap
  and signature check bound the damage meanwhile.

**Deploy notes**: `FEATURE_COMMIT_AUTOMATION` stays OFF in production until a repo is
connected. When it goes live: verify the openresty proxy at q.fikrawork.com passes the
request body through UNTOUCHED — signature verification breaks on any rewrite; the §6.3
deploy check is a signed test delivery from GitHub's "Redeliver" button.

**Verified**: lint/typecheck/build green, 673/673 tests (88 files; 22-case grammar table
+ signature suite incl. the proxy-rewrite failure mode; a 10-test webhook RLS suite
covering the §6.3 done-when list). Live end-to-end against the dev server with curl:
ping 200, bad signature 401, unknown repo 204, signed `fixes P001-2` push moved the task
to In Review with the commit chip rendering on the board card, replay returned
`{replay:true}` and changed nothing. Demo wiring removed afterwards; `resetTenant` in
the seed now clears both new tables (webhook_delivery has no cascade path).

---

## DM1.45 — Exports, e2e smoke, CI (M9-A)

First half of M9 (docs/16 §12): the parts that harden what exists without touching the
data model. The ClickUp table drop and server PDF are M9-B — each blocked on a decision
that deserves daylight, not a footnote (see deferrals below).

- **One CSV serializer** (`src/lib/csv.ts`): UTF-8 BOM (Excel guesses encodings without
  it), CRLF per RFC 4180, quote-doubling, and a **formula-injection guard** — a task
  titled `=HYPERLINK(...)` must open as text, never execute (OWASP CSV injection). The
  guard fires on any leading `= + - @`, which means a negative number renders as `'-5`;
  asserted in a test as a CHOSEN trade — safety over cosmetics — so a future "fix" is a
  conscious decision. The time report's hand-rolled CSV was refactored onto it: the
  utility exists precisely so escaping decisions stop being made per route.
- **One export route** (`/api/export?kind=projects|tasks|risks|allocations`): each kind
  reuses the EXACT engine and permission its screen renders from — the file you download
  is the table you were looking at. Tasks go through the DM1.43 board wall
  (`viewerBoardCategory` + `taskVisibleTo`), not around it: a dev's export contains their
  lane, nothing else. Buttons are plain anchors — the server is the only data path, so
  screen and file cannot drift.
- **e2e smoke** (`tests/e2e/smoke.spec.ts`): the golden path on a seeded DB — login,
  persona dashboard, personal board lanes, project board with all four PM lenses and a
  REAL CSV download asserted by filename, reports page, risks page, and a Riverbank
  login for the second tenant's shell. Deliberately shallow: it catches "auth broke / a
  surface 500s", and leaves behaviour to the 680 unit/RLS tests.
- **CI** (`.github/workflows/ci.yml`): the same gates the Definition of Done runs
  locally — Postgres 17 service, migrate + seed, lint/typecheck/vitest, production
  build, and a separate Playwright job with the report uploaded on failure. All secrets
  in CI are SYNTHETIC (a base64 test key so `encryptSecret` works); production values
  never enter the workflow.
- **docs/09-ui-spec.md rewritten**: it still described the v1 exec-dashboard HTML
  (sidebar shell, /standalone, heatmap-first overview) — surfaces removed across M0–M8.
  It now maps the real app and points at the specs that own each behaviour.

**Deferred, stated**:
- **XLSX** — a true `.xlsx` writer needs a dependency not in docs/03; BOM'd CSV opens
  cleanly in Excel, which was the actual ask. Revisit if someone needs formatted sheets.
- **Server PDF** — Playwright-rendered print HTML per the spec, but shipping Chromium in
  the production image is a ~400 MB image change and an OS-deps decision for the box;
  M9-B makes that call explicitly.

**Verified**: lint/typecheck/build green, 680/680 unit+RLS (89 files) and 6/6 e2e
locally; all four export kinds fetched live with real rows (15 projects / 6 tasks / 6
risks / 4 allocations) and correct attachment headers. One process lesson repeated
itself: an earlier verification ran against a PRE-reseed project id and read "empty" —
the fixture id, not the code. Re-derive ids after any reseed.

---

## DM1.46 — KCB the customer is gone; the architecture and its proof stay (M10)

Per Joyce (2026-08-03): strip the KCB tenant, remain Riverbank-only.

**What "strip" means here, precisely:**
- **Multitenancy stays.** RLS on every table is rule 1 of CLAUDE.md and is not customer
  config — it is how the system proves isolation at all. What was removed is a CUSTOMER,
  not the architecture.
- **The old KCB demo dataset was renamed, not deleted.** ~50 RLS/persona suites and the
  e2e smoke depend on its SHAPE (portfolios, programmes, markets, checkpoint templates,
  the first-project task fixtures, qa.demo/impl.demo users). It now seeds as **Demo Org
  B** (`demo-b`, neutral slate branding, `.invalid` domains, "Demo Kenya"-style org
  units, demo.admin@demo-b.example.invalid) — unmistakably synthetic, never a customer.
  A first pass tried a MINIMAL tenant B instead; it was reverted within the hour because
  it silently invalidated every suite that reads seeded content. Rename beats rebuild.
- **Riverbank keeps KCB references that are Riverbank's own data**: the
  "Business Case Approval (KCB)" stage name and the rollout-portfolio description come
  from `docs/Riverbank Projects.docx` — KCB is Riverbank's CLIENT in those, and deleting
  the words would falsify the business record.
- **Production needed nothing**: it has only ever held the `riverbank` tenant (verified
  on the box — tenant list is real; the zero row-counts in the same query were the
  unscoped-psql RLS trap, again). The seed still calls `resetTenant("kcb")` so any
  pre-M10 DEV database comes out clean on its next reseed.

**App strip:** KCB quick sign-in card; the topbar KCB emblem special-case; KCB's licensed
Lufga font files (`src/assets/KCB/` deleted — the landing/auth surfaces repoint to Plus
Jakarta Sans) and the `[data-tenant="kcb"]` theme blocks; marketing copy naming KCB Group
as a customer ("Built for Riverbank Group", one trust chip); `--kcb-blue` renamed
`--navy` (it is QUBIT's own accent). Theming remains data-driven per tenant row — any
future tenant brings its own colours; only Riverbank has a bespoke re-skin.

**Tests:** the fixture tenant renamed across 56 files (slug, domains, admin email,
identifiers); the three UI unit suites now assert KCB's ABSENCE on the login and landing
pages. CLAUDE.md's Definition of Done reworded: "works for Riverbank with correct
theming, and breaks nothing under the synthetic fixture tenant" — the isolation test
requirement is unchanged.

**Verified**: lint/typecheck/build green, 680/680 unit+RLS, 6/6 e2e (golden path now runs
on Demo Org B's full-shaped fixture; the Riverbank login test covers the real tenant).
Browser-checked: landing trust strip names only Riverbank, login shows a single Riverbank
quick sign-in resolving "Signing in to Riverbank Group", Joyce's exec dashboard renders
the red re-skin over the RBS portfolio. Deployed with no schema change.

---

## DM1.47 — Onboarding/IAM: two real security holes closed; admin CRUD gets one primitive (M-O1 + M-O2)

Per the 2026-08-03 audit (docs/19) and the rebuild spec (docs/20). The audit's verdict for
this module was **"keep + security fix"**, not rebuild — the role→permission→persona model
is sound; two defects in how it was ENFORCED were not.

**M-O1 — the fixes that gate everything else:**

- **`mustChangePassword` could be lifted by the browser.** The JWT callback trusted
  `update({ mustChangePassword: false })` from the client, so anyone holding an
  admin-issued temp password could clear their own onboarding gate from the console and
  enter the app without ever changing it. Now: the client asserts NOTHING (`update({})`
  is a bare refresh trigger) and the callback re-reads the flag from the database.
  Structural wrinkle worth remembering: `auth.config.ts` targets the EDGE runtime and
  cannot load Prisma, so the DB-reading callback is composed over the edge one in the
  Node-runtime `auth.ts`. The edge config now only hydrates on initial sign-in.
- **Privilege escalation via `users:invite`.** `HeadOfProjects`/`HeadOfQA` hold that
  permission, and `createUser` accepted any `roles` array — including
  `PlatformSuperAdmin`. `updateUserRoles` guarded self-demotion but not granting. Now
  `assertMayGrantSuperAdmin` rejects both paths unless the ACTOR holds the role
  (`FORBIDDEN_GRANT`), read from the session context, never the request body.
- **Verified as an attack, not a diff.** Against a gated fixture user on the dev server:
  signed in → gated; forged `update({mustChangePassword:false})` → **still gated**; real
  reset via `/api/onboarding/complete` → 200; bare session refresh → gate lifted. That
  sequence is the regression test in prose.

**Known residual, deliberately deferred** (docs/20 §4): the guard reads `ctx.roles` from
the session, so a demoted Super Admin keeps grant power until their 24h token expires.
The same callback should re-read `status` and treat non-ACTIVE as signed out — one fix,
one place, tracked as the suspended-user follow-up.

**M-O2 — structure, no behaviour change:** `useAdminMutation` replaces the
`useState(loading/error) + fetch + res.ok ? refresh : setError` block that was copied into
every admin dialog; `GROUP_LABELS` moves to one module. Role-grant UI gating mirrors the
M-O1 server guard as defence in depth — the Administrator tier is hidden from admins who
can't grant it, and an EXISTING Super Admin renders locked rather than vanishing, so you
can still see who holds it. `<AdminTable>`/`<AdminDialog>` extraction and the
teams/departments adoption are M-O2b (docs/21).

**Verified**: lint/typecheck green, 684/684 tests (4 new: non-superadmin cannot create or
promote a superadmin via either path; a superadmin can). No schema change, no migration.

---

## DM1.48 — Admin shell primitives; every admin mutation goes through one hook (M-O2b)

Executed docs/21. Pure structural refactor — the acceptance bar was "no admin component
under `src/app/(app)/admin/**` hand-rolls fetch state", and that now holds.

- **`<AdminTable>` and `<AdminFormDialog>`** extracted from the users screen, tokens
  copied verbatim rather than re-derived: this is consolidation, so a visual diff would
  have been a failure, not a bonus.
- **The two department dialogs became one.** `new-department-dialog` and
  `edit-department-dialog` were ~95% identical — same four fields, differing only in
  initial state and POST-vs-PATCH. Mode is now a prop; the field markup exists once and
  the paths cannot drift. Verified both live (201 / 200 / 200 across create, edit, delete).
- **Teams adopted the standard shell** — `AdminHeader` + the shared main wrapper +
  `AdminTable`, replacing a Breadcrumb and its own `CARD`/`ROW` constants.
- **Scope widened by one step, deliberately.** docs/21 §3.3 listed teams/departments row
  actions as optional, but its §5 acceptance says "no admin component". `roles-editor` and
  `access-requests-client` were the last two holdouts, so they were migrated too — leaving
  them would have made the criterion false.
- **Two latent bugs fell out of the migration.** Team delete and access-request review
  both did `await fetch(...)` and never checked `res.ok`: a server-side refusal closed the
  dialog and read as success. Both now surface the server's message. This is the argument
  for the shared hook in one line — the duplicated pattern wasn't just repetitive, it was
  repetitively *wrong* in places nobody had noticed.

**Verified**: lint/typecheck/build green, 684/684 tests, both screens browser-checked
under Riverbank theming, department create/edit/delete exercised live.

---

## DM1.49 — Token invites replace temp passwords; the accept path keeps RLS (M-O3)

Executed docs/22. An invite is now a one-time link, not a password an admin types, reads
aloud, and pastes into chat.

- **No password is ever created for an invitee.** `createUser` makes them `INVITED` with
  `passwordHash: null` — the account cannot be signed into at all until they consume
  their token. That closes the whole category of "temp password shared over Slack",
  because there is nothing to share.
- **Only the token's SHA-256 is stored.** The raw 256-bit value exists in the emailed
  link and the mint call's return, never in the database and never in an audit row
  (asserted by a test that greps the audit blob for the raw token).
- **The spec's RLS-exempt read was rejected.** docs/22 §4.2 modelled the accept lookup on
  `access_request`'s documented exemption. That reasoning does not transfer:
  `access_request` is exempt because it has NO `tenant_id`, whereas `invite_token` is a
  tenant table under FORCE RLS — a direct `findUnique` outside `withTenant` matches zero
  rows (exactly the DM1.18 trap, which is how the tests caught it). The only way to make
  the spec's approach work would be to drop isolation on a table holding
  credentials-grade capabilities. Instead `consumeInviteToken` probes each tenant's RLS
  context — the same pattern `resolveGithubIntegration` uses for unauthenticated webhooks
  — costing one indexed lookup per tenant and keeping CLAUDE.md rule 1 intact.
- **Every failure reads identically.** Missing, expired, and already-consumed all return
  "This link is invalid or has expired", so the public endpoint can't be used to discover
  which tokens exist. Bad tokens count against the per-IP limiter; a weak or reused
  password does not — that's a legitimate user getting it wrong, not someone probing.
- **Resend invalidates what it replaces**, so "resend" narrows the window rather than
  leaving two live links.
- **A suspended user accepting a reset link stays suspended.** The link sets a password;
  it does not reinstate access.
- **`prisma/rls.sql` was 15 tables behind** and is now resynced (72/72). Every table since
  M4 applies RLS inline in its own migration, so the live database was never unprotected
  — but the file read as authoritative while being materially incomplete, which is how a
  future disaster-recovery run would have quietly under-protected the newer tables.

**Contract change**: `createUser` returns `{ user, emailed, acceptUrl? }` and no longer
accepts a password — six test files updated. `useAdminMutation.onSuccess` now receives
the parsed response body, which the invite result needs.

**Verified**: lint/typecheck/build green, 703/703 tests (19 new across the token unit
suite and the invite RLS suite). Live end-to-end on the dev server: invited a user →
copyable link (email off) → the PUBLIC accept page rendered with no session → set a
password through the real form → signed in as the invitee with `mustChangePassword`
false → replaying the same link returned 400. Fixture removed afterwards.

**Ops note**: until `FEATURE_EMAIL` + the four `GRAPH_*` vars are set on the box,
`emailEnabled()` is false and every invite/reset returns the copyable link instead of
sending — the flow works today, it just doesn't email yet.

## DM1.50 — MFA enrolment is server-bound; the onboarding gate lifts only at finish (M-O4)

Executed docs/23. First login is now a guided flow — password → two-factor → confirm —
and the two security holes it existed to close are closed.

- **A5 fix: the client can no longer choose the secret it is verified against.**
  `/enroll` generates the secret server-side, stores it ENCRYPTED in `pendingMfaSecret`,
  and returns only the QR data-URL. `/verify` accepts `{ token }` alone (`z.string().length(6)`
  — the old schema's `secret` field is gone), reads the pending secret from the DB,
  and promotes it to `mfaSecret` on a good code. Enrolling an attacker-known secret now
  requires writing the database, not calling an API. Pinned by an RLS-suite regression test.
- **Recovery codes, hashes only.** Ten single-use codes are returned exactly once, at
  confirm time; SHA-256 hashes are stored, and `authorize()` consumes a matched hash in
  the same transaction that admits the login — no reuse window. An admin reset
  (`users:reset`) clears live + pending secret and all codes.
- **MFA is required by role, enforced server-side.** `mfaRequired()` — PlatformSuperAdmin,
  HeadOfProjects, HeadOfQA, Executive. The skip link is only rendered for non-privileged
  roles, but the real enforcement is in `finishOnboarding`, which re-reads roles and
  `mfaSecret` from the DB.
- **The gate lifts in exactly one place.** Setting a password no longer clears
  `mustChangePassword` (`setOnboardingPassword` just stamps the fact); only
  `/api/onboarding/finish` clears it, after re-checking every prerequisite from the DB.
  Closing the tab mid-flow resumes where the user left off; no client assertion is
  trusted (M-O1's rule, extended to the whole flow).
- **Regression I introduced and closed: a password HASH is not proof of a CHOSEN
  password.** The first cut of `finishOnboarding` checked `passwordHash !== null`, which
  a legacy user holding an admin-issued temp password satisfies — they could lift their
  own gate without changing the password (the M-O1 bypass through another door). Browser
  verification caught it; the fix is a `passwordSetAt` column stamped only by
  `setOnboardingPassword`/accept, backfilled for users who already chose their password
  (`must_change_password = false`), required by finish, and pinned by a regression test.
  `needsPassword` on the stepper keys off the same column, so temp-password users are
  routed through the password step instead of being stranded at MFA.
- **The backfill itself hit the DM1.18 trap — and post-deploy verification caught it.**
  The original migration argued "whole-table truth, no tenant loop needed" and ran a
  plain `UPDATE` — which matched zero rows in every environment, because FORCE RLS hides
  the rows from the migration role no matter what the semantics are. DM1.18 is about
  VISIBILITY, not meaning; there is no exemption for "additive" DML. Fix-up migration
  `20260803160000_mo4_password_set_at_backfill_rls` re-runs it in the tenant loop
  (idempotent: only rows still NULL). Verified 3/3 settled users stamped per tenant in
  dev, and re-verified on prod after deploy. Corollary: NEVER trust a bare row count on
  a FORCE-RLS table — `SELECT count(*)` outside a tenant context reads 0 and looks like
  an empty table.
- **Theming**: `/onboarding` mounts `TenantScope`, so `bg-primary` controls (the
  buttons) resolve to the tenant brand at the document root. Previously only components
  reading `var(--brand)` directly (the step dots) went red — `--primary` resolves at
  `:root`, which the wrapper's inline `--brand` never reached.
- **First-login checklist is column-backed, not localStorage** (docs/23 §7). The
  dashboard shows it only when `onboardedAt` is set and `checklistDismissedAt` is null;
  dismissal is `POST /api/me/checklist` (audited, `updateMany` guarded on null so
  replays don't re-audit). Legacy users — who never went through the guided flow — are
  deliberately NOT shown a welcome card weeks into using the product.

**Verified**: lint/typecheck/build green, 723/723 tests (21 new: recovery-code unit
suite + MFA/finish RLS suite). Live on the dev server as a gated fixture Member with an
admin temp password: early `/finish` returned `{missing:"password"}` → stepper opened on
Password → set own password (gate still on, `passwordSetAt` stamped) → enrolled TOTP
from the real QR flow (pending → live only after a valid code; wrong code rejected) →
10 recovery codes shown once → finish lifted the gate, stamped `onboardedAt`, landed on
the Developer dashboard. Fixture removed afterwards.

## DM1.51 — Create & assign schema: category axis, assignment windows, staffing tables (M-P1a)

First milestone of docs/27 (the docs/26 P1 track). Schema + keys only — no UI yet.

- **`category` (Approved|Exploring|Shelved) lands on Portfolio and Programme**, default
  Exploring. It is the business-pipeline axis from Joyce's notes (docs/24), distinct from
  `viewKind` (how a portfolio is shown) and from delivery status (derived from
  checkpoints). Projects keep `pipelineStage` — same axis one level down; no remap.
- **Backfill ran INSIDE the tenant loop** — portfolio/programme are FORCE-RLS, and the
  DM1.50 lesson is now a checklist item, not a memory. Everything existing at migration
  time → Approved (it is live delivery work); the dev seed sets `category: "Approved"`
  explicitly so a reseeded DB matches what the backfill produced in prod. The suite's
  first assertion exists precisely to scream if a future loop silently no-ops.
- **`ProjectMember` gains `startDate`/`endDate`** — an assignment is person + role hat +
  allocation + window (docs/26 §4.3). Pre-P1 rows stay NULL/NULL (open-ended): no
  invented dates.
- **`resource_request`** — a PM asks for a SHAPE ("1 QA · 60% · Aug–Sep"), the Head
  resolves it; `filledMemberId` is the receipt linking the request to the assignment it
  produced. **`team_template`** — one-click team shapes; "Standard build" seeded
  (PM 20 · Tech Lead 40 · 2×Dev 60 · QA 60 · Impl 50). Both tables FORCE-RLS inline in
  the migration; `prisma/rls.sql` resynced (72→74).
- **Keys** (docs/27 §1.4): `portfolio:create` + `programme:create` → Executive and
  HeadOfProjects (the notes put the Add button on the exec's Portfolio page);
  `staffing:manage` → HeadOfProjects only. `canRaiseResourceRequest` = the project's
  delivery owner or `staffing:manage` — the asker never resolves their own ask.

**Verified**: lint/typecheck/build green, 732/732 tests (8 new: backfill semantics,
assignment window, cross-tenant read AND write denial on both new tables, seeded shape,
key grants/denials, raise-scope). Schema-only — browser verification deferred to M-P1b
when the first surface lands.

## DM1.52 — Wizard chrome + portfolio/programme creation; the portfolio index returns (M-P1b)

Second docs/27 milestone. The first user-visible piece of the docs/26 remodel.

- **Shared wizard chrome** (`src/components/wizard/`): left rail with ticked/current/
  conditionally-skipped steps, one-question cards, the standard error slot, Back/Continue/
  Create + "Create another". Step navigation is a PURE module (`src/lib/wizard.ts`) —
  skip-hopping in both directions and settling off a step that becomes skipped underneath
  the user are unit-tested, not hoped.
- **Drafts are localStorage, per wizard AND per user** (docs/27 §1.3), saved on every
  change, cleared on success. Verified the hard way: the create 500'd mid-walk (stale dev
  Prisma client), the server restarted, and the wizard resumed at Review with everything
  intact — exactly the failure the draft exists for.
- **Portfolio wizard** (`/portfolios/new`, gate `portfolio:create`): Identity → Lens →
  Markets (greyed under Pipeline — markets are a Rollout concept, and the engine also
  drops them server-side, never trusting the client's step logic) → Governance (read-only
  statement of the role-derived defaults until docs/28 wires recipients) → Review.
  Owner must hold Head/Executive (checked in the ENGINE against role assignments).
- **`Portfolio.defaultMarkets` (Json)** added for the wizard's market picks — the project
  wizard pre-fills from it (M-P1c). Market ids are validated against `OrgUnit.kind=Market`.
- **Programme creation is ONE dialog** (docs/26 §5.2) on the portfolio detail page —
  name + category, parented to the page's portfolio. It exists to group; anything more is
  a project.
- **The portfolio index is resurrected** (culled to a redirect in M0): category-grouped
  square cards (Approved · Exploring · Shelved), viewKind pill, market flags, RAG dot,
  create button only for key-holders. "Portfolios" returns to the primary nav.
- Every create audited + `portfolio.created` evented through the outbox.

**Verified**: lint/typecheck/build green, 743/743 (11 new). Live walk as Joyce
(SuperAdmin): wizard end-to-end incl. draft resume across a server restart, programme
dialog, cards grouping (new portfolio under Exploring), audit + event rows read back
under RLS. Fixtures removed. One tooling note: after a mid-session viewport resize the
browser pane's physical clicks stopped registering; verification continued with
DOM-dispatched clicks — same app code path. The Base UI `nativeButton` warning on the
link-styled create button was fixed in the same pass.

## DM1.53 — The project wizard: seven questions, one transaction (M-P1c)

Third docs/27 milestone — the centrepiece of the create & assign track.

- **`/projects/new`**: Basics (auto-suggested code, portfolio REQUIRED, programme
  filtered by portfolio) → Type & delivery (checkpoint-template cards; stage is fixed at
  Exploring — promotion is governance, not a form field) → Markets (pre-filled from the
  portfolio's `defaultMarkets` until touched) → Team → Docs → Integration → Review.
- **The Team step is capacity-aware** (docs/26 §4.3): one-click team template ("Standard
  build"), per-row role hat + allocation + window, live load from `listWorkload`,
  over-allocation and leave-window warnings with one-click least-loaded alternates.
  Warnings INFORM, never block — and the accepted set travels to the server and lands in
  the audit blob, so an override is always a recorded decision.
- **One transaction** (docs/27 §1.6): project + members + market org-statuses + template
  link + optional BRD + optional YouTrack connection land together or not at all —
  pinned by a test that fails a late reference and counts zero residue. The first
  Project Manager hat becomes `Project.leadUserId` (DM1.21's "every project has a PM").
- **Draft policy has two deliberate holes**: the YouTrack token (a secret) and any
  attached file (megabytes) are never written to localStorage; everything else resumes.
- **Both legacy flat create dialogs are retired** — /projects and the portfolio detail
  page now link to the wizard (the detail page pre-selects its portfolio).
- **Bug caught live, then pinned**: checkpoint-template ids are CUIDs (M-D-A era), and
  the wire schema's `.uuid()` rejected them — the engine suite stayed green because it
  bypasses Zod. The suite now parses the wire schema too; the route and the engine can
  no longer drift apart silently. Repo connect stays in workspace → Integrations (it
  mints a webhook secret shown once — a ceremony a wizard step shouldn't swallow).

**Verified**: lint/typecheck/build green, 748/748 (5 new). Live walk as Joyce: wizard
end-to-end — auto-code hint (WW), programme select filtered, template card, markets,
Standard-build template applied then trimmed, a real 140% over-allocation warning
(fixture-induced) shown on the row and counted on Review ("1 warning accepted"), create
landed in the new workspace; DB read-back confirmed members/tracks/template/lead and
`acceptedWarnings` in the audit row. Fixtures removed, qa.demo's allocation restored.

## DM1.54 — Staffing leaves the side channel: assign panel, resource requests, invite scope (M-P1d)

Fourth and final docs/27 milestone — the create & assign track (docs/26 P1) is complete.

- **The assign panel is capacity-aware everywhere** (docs/26 §4.3). The workspace Team
  tab's bare add-row became a bulk panel: candidates from the bench (least booked first,
  leave-in-window badged), one shared role hat + allocation + window, warnings that
  inform and travel to the audit blob. Bulk add is ONE transaction
  (`addProjectMembers`), every assignee notified through the outbox.
- **Resource requests**: a PM asks for a SHAPE ("1 QA · 60% · Aug–Sep"), never a person.
  Raising is resource-scoped (the project's lead/PM via `access.ts` — a new
  `requireSession` guard exists precisely because no blanket key expresses that);
  resolving is `staffing:manage` only — the asker never resolves their own ask. Fill
  upserts the assignment WITH the request's shape and stamps `filledMemberId` as the
  receipt; decline REQUIRES a reason, and the raiser's notification carries it verbatim.
  No double resolution. `/staffing` joins the nav for PMs and Heads.
- **The bench is role-agnostic** — role hats are per-project, so it ranks every active
  user by booked allocation with leave-days-in-window surfaced; the fill assigns the hat.
- **`setProjectMember` gained the assignment window** (dates omitted = untouched), so
  every assign surface — wizard, panel, fill — speaks the same shape.
- **Invite role-and-scope preview** (docs/26 §4.2): the invite dialog now says, before
  sending, where the person lands AND what they'll be able to do ("Scope: creates
  projects and manages the ones they lead…") — derived from the same role tiers, so it
  cannot drift from the grants.

**Verified**: lint/typecheck/build green, 754/754 (6 new: raise-scope denial, bench
ordering + leave surfacing, fill receipt + notify + no-double-resolution, decline reason
flow, list scoping, RLS). Live walk as Joyce: raised "1 QA · 60% · Sep" → filled from
the bench (pill "Filled — Joyce Okore") → second request declined with a reason shown in
its pill → workspace Add-to-team dialog assigned QA Demo with badges and window → invite
dialog showed the scope line. DB read-back confirmed receipts, notes, 4 audit rows and
notification fan-out. All verification residue removed.

## DM1.55 — Programmes index + the slim member nav (M-W1a)

First docs/32 milestone (dashboard & nav remodel). No schema changes.

- **`/programmes`**: category-grouped cards (Approved · Exploring · Shelved) with parent
  portfolio, project count, RAG dot and derived progress — the same math as the
  portfolio cards, one level down (`getProgrammeCards`). Cards link to the parent
  portfolio: programmes exist to group (docs/26 §5.2), they earn no detail page. The
  create dialog grew an optional parent-portfolio select for index use.
- **One nav filter, two shells** (`visibleNavItems`): the topbar pills and the Riverbank
  sidebar now consume the same pure function, so they cannot drift. New `memberHidden`
  flag + `isMemberOnly(personas)` — true only when every held group is dev/qa/
  implementor; an EMPTY persona list fails OPEN to the full nav (hiding surfaces from an
  unclassified account would be a silent lockout).
- **The member nav is the slim four** (docs/32 §0.3, confirmed): Dashboard · My Board ·
  Projects · Reports. Presentation only — `programme:read`/`portfolio:read` stay BASE
  grants and the pages remain URL-reachable; nothing about permissions changed.

**Verified**: lint/typecheck/build green, 762/762 (8 new). Live: created "Core Banking"
under Market Rollout via the index dialog → appeared grouped under Approved; signed in
as qa.demo → nav showed exactly the four items while /programmes stayed reachable by
URL (200). Fixture removed.

## DM1.56 — Exec re-lay: estate cards, category grouping, the Head's queue, honest budget (M-W1b)

Second docs/32 milestone. Read-only — no schema, no new mutations.

- **The notes' (ii) cards row**: Portfolios · Programmes · Active projects, each a
  link-through to its index. Counts, not KPIs — the DM1.29 KPI-strip stays dead.
- **Sections group by the business pipeline**: Approved → Exploring → Shelved headers on
  the exec dashboard, worst health first WITHIN a group (the pure
  `groupSectionsByCategory` partitions the already-sorted input; the PortfolioSections
  component is untouched). Unknown categories land in Approved rather than vanishing.
- **The Head's queue** (docs/25 matrix row 1, composed not forked — DM1.10): holders of
  HeadOfProjects (and SuperAdmin) get a "PM check-ins this week" panel — per active
  project: PM, RAG dot via the shared health tokens, Confirmed/Draft/None pill, CSV
  export shortcuts. The panel SAYS the approve step arrives with the Head roll-up (P3)
  instead of faking a button. A plain Executive gets `headQueue: null` and never renders
  it — engine-tested both ways.
- **Budget is honest everywhere** (docs/32 §0.2): the workspace governance card (edit
  AND read-only renders) and both slide panels now show "typed in Phase C" when null —
  an em-dash read as "no budget exists", which is not what's true.

**Verified**: lint/typecheck/build green, 766/766 (4 new). Live as Joyce: exec view
showed the counts row (2 · 0 · 25) linking through, the Head queue with 25 rows and
check-in pills, the Approved section header over both portfolios, and the workspace
governance card reading "Budget: typed in Phase C".

## DM1.57 — PM home in the drawn shape: the Δ table, then everything stuck on me (M-W1c)

Third docs/32 milestone — the dashboard remodel (M-W1a–c) is complete. Read-only.

- **Order is the answer to the PM's landing question** ("what needs me", not "browse the
  estate"): check-in banner → MY PROJECTS table → action queue + team load → the shared
  portfolio sections BELOW, still with the DM1.20 mine/ALL toggle. Nothing was removed —
  re-ordered.
- **The my-projects table**: RAG dot (shared tokens) · derived progress bar · **Δ WoW**
  from `ProjectSnapshot` (newest snapshot ≥6 days old, bounded to 21 days; NULL before
  history exists — never invented) · next milestone (earliest not-Done, with a "slipped"
  flag) · open-blocker pill · Open →. Worst status first. "My" = lead or PM-hat member —
  scoping, not visibility.
- **Team load grew its summary line** ("N over 90% · M on leave") and the "Raise a
  resource request →" link into /staffing — the docs/26 §4.3 loop closes from the daily
  surface.
- The action queue was already right (M18-era) and is untouched.

**Verified**: lint/typecheck/build green, 767/767 (1 new engine test pinning Δ math,
slipped-milestone flag, blocker count, worst-first order, my-scoping, and Δ=null without
history). Live as Joyce (PM persona): banner, HomeQuest row (48%, "UAT sign-off — pilot
branch · 12 Aug", 1 open blocker), team-load summary + staffing link, sections below.

### DM1.57 addendum — wireframe-match pass (same day)

Joyce asked for the built UI to match the wireframe HTML exactly; three divergences on
the remodeled screens were closed (nothing else touched):
- Exec: the aggregate counts row became the wireframe's **per-portfolio square cards**
  ("click a card → its page": name, RAG dot, lens · count, progress bar, category tag,
  Δ WoW) built from the sections data — the engine's unused `counts` field was removed.
- Head queue: the wireframe's **four KPI cards** now sit above the rows (check-ins in ·
  unconfirmed · red/amber · awaiting my approval, the last honestly "arrives with P3"),
  and each row carries the visible **Review →** chip.
- PM banner: the **"Open check-ins →"** primary button (lands on the worst project's
  workspace, where check-ins are confirmed).

Verified live on all three; 767/767 stays green.

## DM1.58 — The org-setup wizard: a tenant usable in ten minutes (M-P1e)

Executes docs/31-p1e — the spec pack's P1-E, un-parked by the pack itself (this doc's
earlier parking in docs/27 §1.7 was overruled by Joyce shipping the spec).

- **A thin orchestrator over things that already exist** (`src/server/org-setup.ts`):
  brand colours on Tenant, Market org units, departments, the two checkpoint templates,
  the M-O3 invite path, the P1-A portfolio wizard. Nothing new was invented — the wizard
  sequences capabilities.
- **Every seeding step is idempotent** (re-running creates nothing — pinned by tests),
  so the wizard is resumable; each step SHOWS what already exists ("7 already exist",
  "Both templates exist ✓") instead of pretending a fresh slate.
- **`importPeople` never aborts the batch**: one `createUser` per CSV row, each minting
  its own invite (email, or the copyable link while the mailer is off — NO temp
  passwords anywhere); a bad row becomes an error result. The parser
  (`src/lib/people-csv.ts`) validates name/email/role/group per line BEFORE the DB is
  touched, with quoted-field support and in-file duplicate detection. The M-O1
  SuperAdmin-grant guard still applies through `createUser`.
- **Super-Admin territory twice over**: the route gates `iam:manage` AND the engine
  re-asserts it, so no future caller can skip either layer.
- **`Tenant.setupCompletedAt`** drives the "Finish setting up QUBIT" banner (both
  shells). Existing tenants were BACKFILLED at migration time — they were stood up by
  script/seed, and greeting Riverbank with a setup banner weeks in would be noise. The
  tenant table carries no RLS (by design), so the backfill is plain DML.
- Step 5 (first portfolio) deliberately LINKS to the full portfolio wizard rather than
  embedding a lesser copy of it.

**Verified**: lint/typecheck/build green, 777/777 (10 new: parser truth table incl.
quoting/duplicates; idempotency ×2 runs; per-row import outcomes with a duplicate
mid-batch; completion stamp; engine-level FORBIDDEN for a PM; cross-tenant leak check).
Live as Joyce: wizard rendered with resume states ("7 already exist", templates ✓,
portfolios ✓), a two-row CSV import returned one invited (with copyable link) and one
per-row error, and the dashboard shows NO banner for the backfilled tenant. Fixture
removed.

## DM1.59 — P1 gap sweep: the spec-pack reconciliation items closed

The four small gaps carried in docs/27 §5 are done; the P1 track now matches the spec
pack (27-p1a…31-p1e) in full.

1. **Portfolio governance PATCH** (27-p1a §3): `updatePortfolio` — name/description/
   category/lens/owner/markets, owner-eligibility and market validation matching create,
   audited with a BEFORE/AFTER diff. `PATCH /api/portfolios/[id]` behind the same
   `portfolio:create` key that governs creation.
2. **Pipeline stage at create** (28-p1b §3): the wizard's Type & delivery step gains
   Exploring/Evaluating/Approved chips — an Approved project can exist on day one when
   the business case predates QUBIT. **Paused is deliberately not offered**: creating a
   paused project is a contradiction. Later moves stay a workspace governance action.
3. **BRD-ingest hand-off** (28-p1b §5.5): creating with an attached document lands on
   the workspace **Documents tab**, where the M8-C extraction ("Review Q's suggestions")
   is one click away. Extraction itself stays human-gated and OUT of the create mutation
   — the spec's own rule.
4. **Cancel-by-raiser** (30-p1d): `Cancelled` joins the request lifecycle — the raiser
   withdraws their own OPEN ask (or the Head tidies a stale one); distinct from
   `Declined` (refused, with a reason). The resolve route dropped its blanket
   `staffing:manage` gate for `requireSession` + per-action authorization in the engine,
   because "raiser of this row" is not a role-level key. No double resolution, audited,
   raiser notified when the Head cancels.

**Verified**: lint/typecheck/build green, 779/779 (3 new lifecycle/audit tests). Live:
stage chips on the wizard, and a raise → Cancel button → cancel (status "Cancelled")
round-trip through the real routes. Fixtures removed.

## DM1.60 — The one read-only board: tasks live in YouTrack, QUBIT reflects (M-P2a)

First docs/33 milestone — the P2 behavioural break, shipped first on purpose.

- **Human task authoring is RETIRED for every role, PMs included** (docs/25 §1,
  superseding docs/18 §4). Create, edit, move, delete, draft-publish and AI plan
  generation all answer `403 TASKS_ARE_MIRRORED` with a message that says where work
  items actually live. The gate sits at the ROUTES; the engine functions stay open
  because the SYSTEM writes through them — the YouTrack sync's upserts and the M7-B
  commit webhook's `updateTask` calls are pinned alive by the same suite that pins the
  routes shut. What stays human: flagging/resolving blockers (RAID), discussing
  (comments), everything that is judgement rather than work-item state.
- **Three lanes, not five columns** (docs/25 §4): To do / Doing / Done as pure VIEWS
  over task states (`laneOf`, unit-tested; unknown states land in Doing — visible beats
  dropped). The exact state stays readable as a chip on each card; Blocked stays a badge,
  never a column. No drop targets, no drag, no status selects — on the project board,
  the personal /board, and the slide panel's task list alike.
- **Sync health leads the board header** (docs/33 — a stale board must never read as a
  quiet one): fresh ("Synced from YouTrack · Nm ago") / stale (>2× the sync interval) /
  error (the actual message) / not connected (with a PM link to Integrations and an
  honest empty-state line instead of an empty lie). Pure derivation, unit-tested.
- **Members default to MINE** with an All toggle (docs/25 §4); PMs keep the four lenses
  and default to All. The QA triage strip stays but assignment happens in YouTrack —
  the strip now says so instead of offering a dead select.
- Legacy AI-draft cards keep their pill (labelled "legacy draft"); the publish flow died
  with authoring. `bug-dialog.tsx` and the generate dialog were deleted, not disabled.

**Verified**: lint/typecheck/build green, 788/788 (9 new: lane table, badge states,
routes-refuse + engine-alive both ways). Live on HomeQuest as Joyce: three lanes, no
add/drag/move affordances anywhere, "🔗 Not connected to YouTrack" badge, read-only
pill, blocker flag intact; e2e smoke untouched (it checks lenses + export only).

## DM1.61 — The Checkpoints & Rollout tab: relocation, not rewrite (M-P2b)

Second docs/33 milestone. No engine changes; 788/788 stays green with every existing
checkpoint/market suite untouched — the proof it was a move.

- New workspace tab **"Checkpoints & Rollout"** (key `Delivery`, docs/25 §3 tab 4)
  between Documents and Deadlines: the PM-editable checkpoint matrix (gates, derived %,
  M8-A rule overrides — all relocated intact from the Overview aside) plus a **market
  strip**: one card per project × Market track (flag, derived %, status) linking to the
  M-D-B drill-down page where the weekly market check-in lives.
- Overview slims accordingly — governance, latest check-in, lessons, decisions,
  activity, definition facts stay; the gate matrix leaves. Old deep links keep working
  (checkpoint links always pointed at the default tab; `?tab=Deadlines` et al. are
  untouched).
- `ProjectPanelJson.marketTracks` is the only data addition: a four-field select over
  `ProjectOrgStatus` × Market org units.

**Verified**: lint/typecheck/build green, 788/788. Live: the tab renders matrix + strip
(HomeQuest: 🇰🇪 75% OnTrack · 🇷🇼 13% Planning · 🇹🇿 50% OnTrack · 🇺🇬 38% AtRisk, each
linking to its market page); a track-less project shows the honest empty line; Overview
no longer carries the matrix but keeps governance/budget.

## DM1.62 — Cross-project dependencies + the blocking map (M-P2c)

Third docs/33 milestone — P2 "Deliver" is complete.

- **`ProjectDependency`**: "Project A waits on Project B", unique per pair, FORCE-RLS
  inline, both project FKs cascade. Declaring/removing is delivery-owner territory
  (`canWriteProject` — the project's lead/PM or a Head); everyone reads both directions.
- **Cycle-checked at write time** with the M7-A walk lifted one level (`wouldCycleProjects`,
  pure): self, direct and TRANSITIVE loops all refuse with `DEPENDENCY_CYCLE` naming both
  codes; a forward shortcut (a→c beside a→b→c) is legal.
- **The other side hears about it**: declaring notifies the depended-on project's PM
  ("your delivery gates theirs") through the outbox. Add audited; remove audited.
- **The workspace card** (Overview aside): Waits on / Blocks with RAG dots from the
  shared health engine, PM-only add/remove, deep links both ways.
- **The portfolio "what's blocking what" panel** (docs/26 §6): LIVE edges only — a
  delivered upstream (Completed/Cancelled) drops off the map instead of crying wolf —
  grouped by the waiting project's portfolio, reddest upstream first.

**Verified**: lint/typecheck/build green, 793/793 (5 new: pure cycle table, gate +
audit + notification, both-direction listing, map liveness rule, RLS). Live as Joyce:
declared "HomeQuest waits on RBS-05 — UAT waits on their API" through the card; the
blocking panel appeared on the Market Rollout portfolio. Fixture removed.

## DM1.63 — Reports move into the workspace; the chain gets its send button (M-P3a)

First docs/34 milestone — authoring belongs where the work lives (docs/25 §6).

- **The workspace Reports tab** (role-composed): a MEMBER sees this project's slice of
  their weekly update — auto-drafted facts, their notes, and the new **"Queries &
  concerns to the PM"** field (rides the `MemberReport.draft` JSON; partial saves never
  wipe it — test-pinned) — and submits from here (labelled honestly: submitting sends
  the WHOLE week, all projects). A PM sees the week's check-in (the M2 card relocated
  from Overview) plus **"Send to the Head of PMs"**; everyone reads the report history
  (week · RAG · narrative · sent-to-Head pill).
- **`CheckIn.submittedToHeadAt`** — one nullable column, and one rule that matters:
  **re-confirming RESETS it.** A changed report must be re-sent; the Head never reviews
  a silently-substituted narrative. Sending requires Confirmed (409 otherwise), audits,
  and notifies the Heads through the outbox. The member's query surfaces in the PM's
  ack view with the report.
- **Overview in the wireframe shape** (docs/25 §3.1): milestones and RAID (blockers)
  fold INTO Overview; the **Deadlines tab retires** (old `?tab=Deadlines` links alias to
  Overview). Tab set: Overview · Board · Documents · Checkpoints & Rollout · **Reports**
  · Team · Integrations — one more than the wireframe's six because Integrations is
  where connect ceremonies live (deliberate, noted).

**Verified**: lint/typecheck/build green, 795/795 (2 new: query round-trip + partial-save
preservation; confirm→send→re-confirm-resets through the engine). Live as Joyce on
HomeQuest: Reports tab with the check-in card, confirm → "Sent to the Head of PMs ·
4 Aug" stamp, history row "2026 W32 … sent to Head"; Deadlines gone, milestones+RAID on
Overview. (The confirmed W32 check-in remains — it is a REAL weekly check-in on the dev
seed, not removable fixture residue.) One ops note: a stale dev server from an earlier
session held port 3000 with a pre-migration Prisma client and had to be killed — the
recurring stale-client lesson, now cross-session.

## DM1.64 — The Head's roll-up: approve freezes the payload (M-P3b)

The reporting chain's top rung (docs/34 §2, docs/19 §6): PM check-ins land in the
Head's queue; the Head builds, annotates and APPROVES; the approved roll-up is what
the executive reads.

- **`PortfolioReport`** — one row per `tenant × isoWeek` (unique), `Draft | Approved`,
  `payload` JSON of assembled rows, `narrative`, `approvedById/At`. New-table migration
  carries inline RLS (ENABLE+FORCE+policy) and `prisma/rls.sql` is resynced (77 tables).
- **The one rule that matters: approve FREEZES.** A Draft is rebuildable from live
  check-ins any number of times (upsert, never a second row); `approveRollup` assembles
  the rows AS OF NOW, stamps the signature, and from then on `getRollup` serves the
  frozen payload — later check-in edits never mutate what the Head signed. A second
  approve (or a rebuild after signing) refuses with `ALREADY_APPROVED` rather than
  silently replacing a signature. Narrative is required (≥5 chars) — an unsigned
  roll-up with no story is not a roll-up.
- **Head-gated in the engine** (`assertHead`: HeadOfProjects | PlatformSuperAdmin),
  not just the route — routes carry `reports:read` plus the engine assert. Approval
  audits and notifies every Executive through the outbox (`rollup.approved`).
- **Surfaces**: the Head's dashboard gets the roll-up strip (build/rebuild → narrative
  → "Approve roll-up →"; APPROVED state shows narrative + approver), the HeadQueue KPI
  goes "all signed" once approved, and the exec hero shows the approved narrative —
  the exec reads what was signed, nothing fresher.

**Verified**: lint/typecheck/build green, 799/799 (4 new: PM forbidden; idempotent
draft; freeze-after-approve incl. refused re-approve; tenant B sees none + exec
notification). Live as Joyce: confirm+send HomeQuest → build draft "1/25 submitted ·
1/25 confirmed" → approve → strip APPROVED, KPI "all signed", exec hero carrying the
narrative. Verification roll-up row deleted; the real W32 check-in kept.

## DM1.65 — The thin reports index; the generate centre retires (M-P3c)

P3's last rung (docs/34 §1, docs/25 §6): authoring lives in the workspaces, and
/reports becomes the index that FINDS, READS and EXPORTS.

- **Role-composed tabs**: members get "My updates" ONLY (the composer — still the one
  home of the whole-week narrative — plus their past weeks; own rows only, pinned).
  PMs add "Team reports" (the ack queue notifications already link to) and "My
  projects' reports"; the Head's version is "All project reports" — every active
  project's latest check-in state, deep-linking into workspace Reports tabs. Anyone
  with `reports:read` keeps the R1–R3 summaries and gains **"Roll-ups"**: the archive,
  Approved weeks for everyone, the standing Draft visible to the Head alone.
- **Exports are honest**: CSV ships now (`/api/rollup/export?week=`, pure formatter in
  `src/lib/report-csv.ts` with quoting pinned by unit tests; Draft weeks export only
  for the Head — same visibility rule as the archive, 404 otherwise, never a leak).
  PDF stays deferred with M9-B and the surface SAYS so.
- **The generate centre retires** (`reports-client.tsx` deleted; `?tab=generate` falls
  back). Q's drawer keeps `/api/q/report` for scoped pulls, and `/reports/s/[token]`
  share links keep working — the standalone builder UI is what died, not the engine.

**Verified**: lint/typecheck/build green, 807/807 (8 new: CSV quoting; own-rows-only;
PM-vs-Head index scoping; Draft-hidden-from-non-heads archive + export rule; tenant B
blind). Live as Joyce: all seven tabs, HomeQuest+HELB rows "sent to Head", roll-up
archive empty state → built Draft appears with working CSV download (200, attachment,
correct rows), `?tab=generate` lands on Status. Verification Draft row deleted under
tenant RLS context; the two real W32 check-ins (both confirmed by the real account)
kept.

## DM1.66 — Idea intake & triage: the funnel finally has a front (M-P4a)

First P4 milestone (docs/35 §1, docs/26 §5.4). Intake was the ONE lifecycle stage in
docs/26 §2 with no surface at all — QUBIT started mid-stream. It doesn't now.

- **`Idea`** — title, sponsor, problem, expectedValue, submitter, `New | Reviewing |
  Accepted | Parked | Merged`, parkReason, suggestedPortfolio, acceptedProject /
  mergedIntoProject, triagedBy/At. Inline RLS in the migration + `prisma/rls.sql`
  resynced (78 tables).
- **Submitting is universal, deciding is not.** `idea:create` sits in **BASE** — a good
  idea can come from anywhere — while `idea:triage` is the Head's (+ SuperAdmin), gated
  at the route AND asserted in the engine. A submitter sees only their OWN ideas
  (userId scoping on top of RLS); the Head sees the queue.
- **Accept → the project wizard, pre-filled** (`?fromIdea=`): title and problem seed
  name/description, the suggested portfolio preselects, and the link is written **inside
  the wizard's own transaction** (`acceptIdeaInTx`) — test-pinned in BOTH directions: a
  failed create (bad market) leaves the idea still `New` with no dangling project, a
  successful one stamps Accepted + acceptedProjectId together. An idea-driven run gets
  its own localStorage draft key so it can't resume or clobber a blank wizard.
- **Park needs a reason** (≥5 chars, the roll-up rule) and **never deletes** — the reason
  it stopped IS the record, and the submitter is told. **Merge** writes provenance that
  shows on the receiving project's Overview ("Where this came from"). A decided idea
  refuses re-decision with `ALREADY_DECIDED`.
- **Q summaries are NOT faked** (docs/35 §3): the `summary` column exists and stays
  null; the card renders nothing rather than a fabricated line. An AI summary ships with
  a Q milestone under the scope+timestamp honesty contract, or not at all.
- **The member nav widened from four to five.** docs/32 §0.3's "slim four" now includes
  Ideas: granting everyone `idea:create` while hiding the only page that uses it would be
  an incoherent half-measure. The nav test was re-pinned with that reason; nothing else
  about the member's estate-free nav changed.
- **Deliberately narrowed vs the wireframe**: the "public-ish" intake form stays inside
  the tenant (authenticated only). Widening it needs a reason we don't have yet.

**Verified**: lint/typecheck/build green, 821/821 (11 new: 8 engine/RLS incl. the
rollback path, 3 wire-schema). Live as Joyce: submitted → New lane with "yours" →
Reviewing → Accept opened the wizard banner-and-fields pre-filled → created IMS whose
Overview carries "IDEA ACCEPTED · Joyce Okore" → a second idea parked with its reason on
the Decided list; no console errors. Verification ideas, the IMS project and idea
audit/event residue removed under tenant RLS context (25 projects and the 2 real W32
check-ins intact).

## DM1.67 — Cleanup: one home for the design tokens, out with the dead code

A quality-only pass across the tree after P1–P4a. No behaviour change; verified by a
green suite plus computed-style checks in the browser.

- **`src/lib/surface.ts` is now the single home** for the card surface and RAG
  presentation tokens. The `CARD` class string had been copy-pasted into **19** files and
  the RAG map (`{ Green: "--ok", Amber: "--warn", Red: "--bad" }`) was **byte-identical in
  10** — a token change meant a 20-file sweep and drift was a matter of time. Both
  variants are preserved exactly (`CARD`, `CARD_GLASS`), plus `ragToken`/`ragChipStyle`/
  `ragFill` helpers for the chip markup that was also being retyped. Local names were kept
  via aliased imports (`RAG_TOKEN as RAG_TOK`) so the 20 call-site bodies are untouched.
- **Verified byte-identical rendering**, not assumed: Tailwind still detects the classes
  from a `.ts` module (cards compute `border-radius: 16px`, 1px hairline, real shadow),
  the glass variant still carries its blur classes on admin surfaces, and RAG chips still
  resolve `--ok/--warn/--bad`. Worth noting for future readers: `--glassblur` is **0px
  under `[data-tenant="riverbank"]` by design** ("solid slate cards, no glass") and
  10/18px in the product-default themes — so `CARD_GLASS` is deliberately flat for
  Riverbank and meaningful for everyone else. That is pre-existing intent, not drift.
- **Dead code removed** — 7 whole files (`refresh-button`, `nav-group`, `health-ring`,
  `project-cards`, `feeds`, `q-toast`, and `src/server/nav.ts` whose only export had no
  callers) and 5 dead functions (`onLeaveUntilByUser`, `readJson`, `assertFound`,
  `connectedProjectIds`, `canWriteRiskOrBlocker`). Four helpers that were only used inside
  their own module lost the needless `export` (`extractEmailDomain`,
  `markdownToHtmlBody`, `assertSafeBaseUrl`, `graphConfigured`) so the module surface
  tells the truth. Net **−371 lines**.
- **One finding surfaced, deliberately NOT hot-fixed**: `canReadBudget` was dead too, and
  it was the ONLY reference to `budget:read` — meaning that permission is granted by role
  but **enforced nowhere**, while `src/server/projects.ts` returns `budget` to any viewer
  who may read the project. Deleting the dead helper doesn't change that (dead code
  protected nothing), so the gap is recorded as a comment at the deletion site and spun
  out as its own task. It is harmless today (budget is an unfilled Phase-C placeholder)
  and wiring a real check is a behaviour change that does not belong in a cleanup commit.

**Verified**: lint/typecheck/build green, 821/821 unchanged; browser spot-checks on
/ideas, /projects, /dashboard, /reports?tab=rollups and /admin/users.

## DM1.68 — Nothing from ClickUp stays (M-C)

Joyce's call, 2026-08-06. docs/19 M-C's "ClickUp-schema removal" executed in full: the
transformation-era models never carried a single row in this product, and leaving them in
the schema kept implying a second, parallel task system.

- **21 tables dropped**: space, folder, list, status_group, status, **task**,
  task_dependency, tag, task_tag, task_assignee, task_watcher, activity, checklist,
  checklist_item, **comment**, field_definition, field_value, view, time_entry, automation,
  automation_run — plus the 4 enums only they used (DependencyType, FieldType, ViewType,
  RunStatus). Schema is **480 lines lighter**; `prisma/rls.sql` pruned to match.
- **Emptiness was verified, not assumed** — counted per tenant under
  `set_config('app.tenant_id', …)` in dev **and production**, because these are FORCE-RLS
  tables where a bare `count(*)` reads 0 whether or not rows exist (the DM1.18/DM1.50
  trap). All 21: zero rows in both.
- **KEPT**, because they are live PPM features that merely sat in the same schema block:
  `team`, `team_member`, `project_member`, `project_team`, `ai_call_log`. The near-miss
  worth recording: an early grep suggested `team` was unused too — the pattern was wrong.
  The authoritative check is which `tx.<model>.` names appear in src/ and tests/.
- **`/time` went with it — a user-visible removal.** `TimeEntry` hung off `task` by a
  REQUIRED FK, so with `task` empty no time entry could exist; there was no capture path
  left (the timer died in the M0 cull) and 0 rows in both environments. The page could only
  ever render an empty table, so the nav item, page, `/api/time/report` and `src/server/
  time.ts` are gone rather than left as furniture. **docs/19 M6 owns bringing time capture
  back against `ProjectTask` if it is still wanted** — flagged in docs/36 §7 so nobody has
  to guess where Time went.
- **`FEATURE_SPACES` deleted** — the last ClickUp flag, and one fewer thing to configure.
- **One robustness bug found and fixed in passing**: the dashboard read the session's user
  with `findUniqueOrThrow`, so a session that outlived its user (account deleted, or a
  reseed) produced a **500 the user could not escape** — the cookie stays valid, so every
  reload hit it again. Now `findUnique` + `redirect("/login")`. Found because reseeding dev
  mid-verification did exactly that.

**Verified**: lint/typecheck/build green, 821/821 unchanged; `prisma validate` clean (it
was what caught all 25 dangling back-relations); reseed runs; `pg_tables`/`pg_type` confirm
all 21 tables and 4 enums gone from dev; `/time` → 404 and `/api/time/report` → 404 in the
browser; dashboard and nav render with no Time entry and no console errors.

## DM1.69 — Backups that are tested, and a health probe that can fail (M-P0a)

The two P0 foundations from docs/36 §4 whose absence could lose data. Chosen over the next
feature milestone deliberately: a bad disk on the box had no recovery path.

- **`/api/health`** runs a real `SELECT 1` and is **excluded from the auth middleware** —
  the same trap this session hit twice already: a probe redirected to `/login` answers
  **302**, and anything checking for a 2xx/3xx reads a dead database as healthy.
  `deploy.sh` now gates on health instead of `/login`, so an app that serves HTML against
  an unreachable database **fails** the deploy rather than passing it. The body is three
  keys and no detail (it is unauthenticated): status, db, latencyMs — the driver error goes
  to the server log, not to the caller. Test-pinned including the no-leak assertion.
- **`scripts/backup-db.sh`** — `pg_dump -Fc` as the **superuser**, not the app role. This
  is the DM1.18 trap one layer down: `qubit` is deliberately non-superuser so FORCE RLS
  applies to it, which means a dump taken as `qubit` would read zero rows from every
  tenant-scoped table and still exit 0 — a *silently empty* backup. Superusers bypass RLS,
  which is also what makes the verification's row counts true totals.
- **The restore is tested, not hoped for.** `--verify` restores the fresh dump into a
  scratch database, then compares **schema (table count), data (an aggregate over tenant /
  user / project / check_in / audit_log) and RLS policy count**, and drops the scratch DB.
  Data and policies both matter: a structurally perfect *empty* restore would pass a
  table-count check, and a restore missing its policies would be a cross-tenant leak
  waiting to happen. First run on the box: **tables 61→61, key rows 142→142, policies
  57→57 — PASS.**
- Also refuses to keep a dump under 10 KB (a truncated file that looks like a backup is
  worse than none), prunes past 14 days, and stores dumps **0600 inside a 0700 directory
  outside the app tree** — they contain real user emails, and `rsync --delete` must never
  be able to reach them. Cron install is idempotent (verified: re-running left exactly two
  QUBIT lines and did not disturb the pre-existing `auto-pull` entry).
- **Stated limit**: the dumps sit on the same machine as the database. They survive a bad
  migration or a mistaken delete, **not a dead disk**. Off-box copies are logged in
  docs/36 §4 as the remaining half.

**Verified**: lint/typecheck/build green, 824/824 (3 new); the health gate proved itself on
its own first deploy (`{"status":"ok","db":"ok","latencyMs":1}`); backup + restore-verify
run twice on the box; dump permissions, cron idempotency and scratch-DB cleanup all checked.

## DM1.70 — A super admin is not a persona; the dashboard stops listing every project

Three corrections from Joyce, 2026-08-07.

- **`PlatformSuperAdmin` no longer implies the "executive" persona.** It was in
  `EXECUTIVE_ROLES`, so the super admin was shown as an executive — a role they do not
  hold. They now derive **every** persona (all five views are theirs to switch between)
  and the dashboard header labels them **Super admin · ALL ACCESS · viewing as X** rather
  than pretending they are one of the five. Presentation only — RBAC already granted `*`.
  Personas are baked into the session (DM1.7), so an existing session picks this up at the
  next sign-in, not immediately.
- **The exec dashboard stopped listing all 25–37 projects.** The check-in panel is now
  four KPIs plus one link; the per-project queue moved to **/reports?tab=checkins**,
  grouped into **portfolio tabs** (All · AI Initiatives · ZED ERP · Swipe · Unassigned)
  with an outstanding count per tab and an "outstanding only" filter. One place to work
  through them instead of an endless list wedged between the exec's other panels.
- **PMs already could not reach /admin** — `admin:access` is granted to
  PlatformSuperAdmin, HeadOfProjects and HeadOfQA only, the nav item is permission-gated,
  and `(app)/admin/layout.tsx` refuses the whole subtree with `<Forbidden/>`. Verified,
  not changed. PMs do keep **Staffing** (`project:create`), which is intended (M-P1d).

Also fixed a pre-existing flaky assertion found in passing: the PM action-queue test took
the FIRST blocker row and asserted its title, so seed data outranking the fixture failed a
test that had nothing to do with the code under test. It now scopes to its own fixture.

**Verified**: lint/typecheck/build green, 824/824. Live: super-admin badge with all five
persona tabs, dashboard link reading "Work through the 25 project check-ins", the new tab
filtering to 3 rows for Market Rollout with no leakage, no console errors.

## DM1.71 — The chain gets its rail, its provenance and its deadline (M-P3d)

The three pieces the workflow wireframe drew that M-P3a shipped the behaviour for but not
the surface. Joyce spotted their absence ("there was a wizard in place for this").

- **Chain rail** on the PM check-in: `Draft (computed) → PM confirm → Sent to Head → Head
  approved`, with the live step marked `aria-current="step"`. The wireframe drew three
  states; the built chain has four, because sending to the Head and the Head signing are
  genuinely separate rungs (M-P3a/M-P3b) and collapsing them would hide where a report is.
- **"Rolls up from"** panel — the computed status made auditable: N of M member updates
  (and how many acknowledged), gates done, open blockers and risks. Members who have not
  sent are **named**: "Still to send: … — their week is not in this report." An unconfirmed
  week is never quietly averaged into a green one (docs/25 §5).
- **Due banner** on the member's update, stating the Friday 17:00 deadline, that the draft
  comes from their board, and that tasks are not editable there.

**Two bugs found by building them**, both fixed and pinned:
- **Retired people were counted as owing an update.** Soft delete keeps membership rows
  (deliberately — references survive), so the first render of the honesty line read
  "Still to send: Deleted user, Deleted user, Deleted user". Provenance now excludes
  DELETED users; the browser caught what the engine test would not have.
- **The due banner was a hydration mismatch waiting to happen** — it computed `new Date()`
  during render, so a server in one timezone and a client in another disagree on the day.
  It now renders after mount only. (The Base UI dialog-id mismatch also visible in that
  console is PRE-EXISTING and untouched.)

**Verified**: lint/typecheck/build green, 830/830. `tests/rls/reporting-chain-e2e.test.ts`
now walks all five rungs plus provenance — including the retired-member case — and the
rail/panel were read back from the live page (`Draft (computed)` current, "0 of 5 member
updates · 2/3 gates done · 1 open blocker", no "Deleted user").
