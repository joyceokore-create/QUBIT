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
