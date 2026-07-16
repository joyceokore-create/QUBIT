# Changelog — QUBIT ClickUp transformation

## Phase 5 — Automations (2026-07-14)

Additive migration `20260710152052_clickup_automations`: `RunStatus` enum,
`Automation`, `AutomationRun` (+ RLS, `rls.sql` + seed reset + `down.sql`).

### Engine (`automations.ts`)
- CRUD + a rule engine: **trigger** (`task.status_changed` / `task.created`) →
  **conditions** (priority / status / assignee) → **actions** (set status /
  priority / assignee / add comment). Actions run through the normal server
  functions, so they emit Activity and can re-trigger — bounded by a **loop guard**
  (MAX_DEPTH = 3). Every fire writes an `AutomationRun` (SUCCESS / SKIPPED /
  FAILED) and bumps `runCount`.
- Wired into `tasks.updateTask` (status change) and `tasks.createTask` (creation),
  after commit, depth-threaded; dynamic import breaks the tasks↔automations cycle.

### API / UI
- `GET/POST /locations/{type}/{id}/automations`, `PATCH/DELETE /automations/{id}`,
  `GET /automations/{id}/runs`.
- `/s/{spaceId}/automations` manager: rule list (trigger→action summary, run count,
  active toggle, delete) + a compact builder (trigger + status/created, action:
  set status / set priority / add comment). Reachable from the sidebar space menu.

### Verification
- `tests/rls/automations.test.ts` (4) — trigger→action + SUCCESS run + runCount,
  condition-fail skip, **status ping-pong stopped by the loop guard at depth 3**
  (SKIPPED/loopGuarded logged), tenant isolation.
- typecheck + lint clean · **full suite 122/122** · **live end-to-end verified**
  through the running app: moving a task to Done fired "Clear priority when Done"
  (HIGH→LOW, runCount 0→1); test data purged.

### Deferred
Natural-language draft endpoint, schedule trigger, `ai.agent` action, more
trigger/condition/action types, and a full visual builder.

## Phase 3 — Time tracking (2026-07-10)

Additive migration `20260710150420_clickup_time_tracking`: `TimeEntry` model
(+ RLS, `rls.sql` + seed reset + `down.sql`).

### Server
- `time.ts` — `startTimer` (**one running timer per user**, enforced → 409),
  `stopTimer` (derives `durationMin`), `addManualEntry`, `getRunningTimer`,
  `listTaskEntries` (+ total), `deleteEntry`, `timeReport` (per-task roll-up with
  billable split over a date range). Activity on start/stop/log.

### API / UI
- `POST /tasks/{id}/time/start`, `POST /time/stop`, `GET /time/running`,
  `GET/POST /tasks/{id}/time`, `DELETE /time/{id}`, `GET /time/report` (+ `format=csv`).
- **Topbar timer widget** — global, ticks every second, persists across navigation
  (re-reads running timer on mount); Stop inline.
- Task panel **Time tracking** section: Start/Stop, tracked-vs-estimate bar, entry
  list, manual minute logging.
- `/time` **timesheet** page: this week's per-task totals + billable + CSV export.

### Verification
- `tests/rls/time.test.ts` (4) — one-running rejection, stop→duration + no-running
  rejection, manual-entry + report sums (incl. billable), cross-tenant 404.
- typecheck + lint clean · **full suite 118/118** · UI verified (topbar `QBT-1 00:00:02`,
  panel section, report `2h 15m` with billable split + CSV); test data purged.

## Phase 2 — Increment 7: views engine (filters/sort/group + saved views + Table) (2026-07-10)

Additive migration `20260710144656_clickup_views`: `ViewType` enum, `View` model
(+ RLS, `rls.sql` + seed reset + `down.sql`).

### Server
- `views/query.ts` — **`queryTasks()` compiler**: one RLS-scoped Prisma query from a
  filter/sort spec (status/priority/assignee/tag/search/due), stable sort with an id
  tiebreaker, and **keyset pagination** (`take: limit+1` → `nextCursor`).
- `views.ts` — saved View CRUD (per location, pinned/default, config JSON).

### API / UI
- `POST /lists/{id}/tasks/query`, `GET/POST /locations/{type}/{id}/views`,
  `PATCH/DELETE /views/{id}`.
- Rebuilt the list page into a **views workspace**: a view bar (List/Board/Table
  tabs, search, Status/Priority/Assignee multi-filters, due filter, **Me mode**,
  group-by, sort, **Save view** + pinned view chips) driving a client fetch to the
  compiled query. Client-side grouping (none/status/priority/assignee).
- **Table view** (sortable columns + assignees/due) with **CSV export**; List &
  Board re-wired to the same compiled results. Removed the now-superseded
  `task-row.tsx` / `quick-add-task.tsx`.

### Verification
- `tests/rls/views.test.ts` (6) — status/priority/search filters, name sort, keyset
  pagination (no page overlap), view CRUD, cross-tenant 404.
- typecheck + lint clean · **full suite 114/114** · UI verified (view bar, Table +
  CSV, grouping) via screenshots.

### Deferred
Calendar/Gantt/Timeline/Workload views, view share tokens, inline-edit in List,
group drag, saved per-user view state, server-driven infinite scroll in the UI.

## Phase 1 — Increment 6: custom fields (2026-07-10)

Additive migration `20260710143404_clickup_custom_fields`: `FieldType` enum (19
types), `FieldDefinition`, `FieldValue` (+ RLS, `rls.sql` + seed reset + `down.sql`).

### Server
- `fields/formula.ts` — **safe formula evaluator** (recursive-descent, no `eval`):
  numbers, `+ - * /` with precedence, unary minus, parens, `{field}` references;
  returns null on missing refs / divide-by-zero; syntax errors throw at definition time.
- `fields/validate.ts` — per-type Zod validation shaped by each field's `config`;
  computed types (FORMULA / PROGRESS_AUTO / AI) are read-only.
- `fields.ts` — definition CRUD, **inheritance resolver** (SPACE → FOLDER chain →
  LIST), value set/get with validation, and computed values on read (FORMULA from
  numeric fields, PROGRESS_AUTO from checklist completion; AI deferred).

### API / UI
- `GET/POST /locations/{type}/{id}/fields`, `PATCH/DELETE /fields/{id}`,
  `GET /tasks/{id}/fields`, `PUT /tasks/{id}/fields/{fieldId}`.
- Task panel **Custom Fields** section: typed editors (text/long-text/number/money/
  date/checkbox/dropdown/url/email/phone/rating/progress) + inline field creator
  (dropdown/formula prompt for config); FORMULA/PROGRESS_AUTO shown read-only "· auto".
  Rich PEOPLE/LABELS/RELATIONSHIP/FILES editors and AI compute are deferred (read-only
  summaries for now).

### Verification
- `tests/unit/formula.test.ts` (6) — precedence, refs, missing→null, div-by-zero→null,
  **no-eval safety** (`process.exit`, `**`, bare `alert` all rejected/inert).
- `tests/rls/fields.test.ts` (7) — per-type validation, dropdown-option enforcement,
  space+folder→task inheritance, FORMULA compute, computed-field write rejection,
  PROGRESS_AUTO from checklists, cross-tenant 404.
- typecheck + lint clean · **full suite 108/108** · UI verified (inherited Sponsor,
  MONEY Budget, live FORMULA `275000 · AUTO`, dropdown); test data purged.

## Phase 1 — Increment 5: people/tags UI + Board view (2026-07-10)

No migration — uses Phase 0 models (TaskAssignee/Watcher/Tag).

### Server / API
- `tags.ts` — space-scoped tag list + create (unique name per space, 409 on dup).
- Extended task detail include with assignee/watcher **names**, tag name/colour, and
  the owning `spaceId`.
- Routes: `GET /users`, `GET/POST /spaces/{id}/tags`,
  `POST|DELETE /tasks/{id}/assignees/{userId}` · `/watchers/{userId}` · `/tags/{tagId}`.

### UI
- Task panel: **Assignees** + **Watchers** (avatar chips + people picker) and **Tags**
  (colored chips, pick existing or create new).
- **Board view**: List | Board switcher on the list page; status columns (semantic
  colours + counts) with **native drag-and-drop** to change a task's status
  (optimistic → PATCH → refresh); cards open the task panel. First slice of the
  Phase 2 views engine (no saved View model/filters yet).

### Verification
- `tests/rls/people-tags.test.ts` (3): assignee add/remove (idempotent), watcher add,
  tag create + uniqueness + task tagging.
- typecheck + lint clean · **full suite 95/95** · UI verified (panel chips + Board
  columns/cards screenshotted), test data purged.

## Phase 1 — Increment 4: checklists + comments (2026-07-10)

Additive migration `20260710125818_clickup_task_collab`: `Checklist`,
`ChecklistItem`, `Comment` (+ RLS on all three, `rls.sql` + seed reset updated,
`down.sql` for rollback).

### Server
- `checklists.ts` — checklist + item CRUD, toggle done, optional item assignee;
  progress derives from done/total. Activity on every mutation (against the task).
- `comments.ts` — one-level threaded comments, emoji **reactions** (toggle),
  **assigned comments** with resolve/reopen, edit (editedAt), soft delete. Rejects
  nesting past one level (422).

### API / UI
- `GET/POST /tasks/{id}/checklists`, `PATCH/DELETE /checklists/{id}`,
  `POST /checklists/{id}/items`, `PATCH/DELETE /checklist-items/{id}`.
- `GET/POST /tasks/{id}/comments`, `PATCH/DELETE /comments/{id}`,
  `POST /comments/{id}/resolve`, `POST /comments/{id}/reactions`.
- Task panel: **Checklists** section (progress bar, add/check/delete items) and a
  **Comments** thread (reply, 👍 react, assign-to-me + resolve). The Activity feed
  now populates live from these mutations.

### Verification
- `tests/rls/collab.test.ts` (6): checklist progress, one-level threading (deeper
  rejected), assigned-comment resolve, reaction toggle on/off, comment soft-delete,
  cross-tenant 404.
- typecheck + lint clean · **full suite 92/92** · UI verified end-to-end
  (checklist with checked item + comment with reaction), then test data purged.
- Note: restart the dev server after a migration — Turbopack caches the Prisma
  client in-process, so new models 500 until it reloads (hit during this increment).

### ClickUp parity note
Task panel now covers: name, status, priority, dates, description, milestone,
subtasks, dependencies (cycle-checked), checklists (progress), threaded comments
(reactions + assigned/resolve), activity. Remaining for full parity: custom fields
(18 types), attachments, TipTap rich text, recurring tasks, watchers/tags UI,
time tracking, bulk actions — tracked as later increments/phases.

## Phase 1 — Increment 3: subtasks + dependencies (2026-07-10)

No migration — Phase 0 already has `Task.parentId` and `TaskDependency`.

### Server (`tasks.ts`)
- `createSubtask` (inherits parent's list); `setParent` (promote/demote) with a
  descendant-cycle guard.
- `addDependency` with **cycle detection**: BLOCKS/WAITING_ON are directed
  (blocker→blocked) and BFS-checked so a new edge can't close a loop; LINKED is
  non-directional. Rejects self-links (422), duplicates (409), cycles (422),
  cross-tenant targets (404). `removeDependency` too.
- `getTask` now returns subtasks + both dependency directions (detail include).
- **Concurrency fix**: per-tenant `pg_advisory_xact_lock` around `seq` issuance —
  parallel task creates previously raced to the same number (caught by tests).

### API / UI
- `POST /tasks/{id}/subtasks`, `POST /tasks/{id}/dependencies`,
  `DELETE /dependencies/{id}`, `PATCH /tasks/{id}/parent`, `GET /tasks/seq/{n}`.
- Task panel: **Subtasks** section (list + open + inline add) and **Dependencies**
  section (blocking / blocked-by, add by `QBT-#` + type, remove, inline cycle error).

### Verification
- `tests/rls/dependencies.test.ts` (8): subtask create, parent-cycle guard, direct +
  transitive (A→B→C→A) dependency cycles, self/duplicate rejection, LINKED bypass,
  remove, cross-tenant. Fixed a parallel-safe `seq` assertion in the CRUD test.
- typecheck + lint clean · **full suite 86/86, stable across repeated runs**.
- UI verified: subtask + dependency both created via the panel and persisted
  (DB-confirmed); status select now renders. Test data cleaned up.

## Phase 1 — Increment 2: hierarchy UI + task panel (2026-07-10)

Frontend on the Increment 1 API. Server components for reads + `router.refresh()`
for writes (TanStack Query + SSE invalidation is the Phase 2 views-engine concern).

### Workspace UI
- URL scheme `/s`, `/s/{spaceId}`, `/s/{spaceId}/l/{listId}` under the (app) shell;
  `/s` → first space → first list; empty states otherwise.
- `SpacesSidebar` — Space→Folder→List tree: expand/collapse, active highlight,
  create space/list (＋), per-node context menu (add list / rename / archive) via
  the shared DropdownMenu. Server-fetched tree, refreshed on mutation.
- List view — breadcrumbs (space / folder / list), task rows (status dot, priority,
  due, `QBT-{seq}`, milestone ◆), inline quick-add (Enter to create).
- **Task panel** (Sheet + `TaskPanelProvider`, mirrors the PPM panel pattern):
  inline name, status dropdown (inherited statuses), priority, due date, description,
  Activity feed — all wired to `PATCH /tasks/{id}` with optimistic-ish refresh.
- Added "Spaces" pill to the topbar nav.

### API / server additions
- `GET /api/v1/lists/{id}/statuses` (`getListStatuses`, inheritance-resolved),
  `GET /api/v1/tasks/{id}/activity` (`listActivity`).

### Verification
- typecheck + lint clean · **full suite 78/78** · both themes screenshotted
  (Riverbank red, AA contrast) · authenticated UI smoke: quick-add creates a task
  and it appears after refresh; task panel opens and edits persist.

### Deferred (later Phase 1 increments)
Drag-reorder, TipTap description/comments, checklists, subtasks, dependencies +
cycle detection, attachments, custom fields (18 types), recurring worker,
quick-create smart-parse, bulk toolbar, status-editor UI — several need the
follow-up additive migration (Checklist, Comment, Attachment, FieldDefinition/Value).

## Phase 1 — Increment 1: backend spine (2026-07-10)

Hierarchy + task CRUD backend (no migration — the task core landed in Phase 0).
UI (sidebar tree, task panel) is Increment 2.

### Server modules (`src/server/`)
- `activity.ts` — `recordActivity()` writes the Activity row + emits the realtime
  event in one transaction (CLAUDE.md rule 6).
- `statuses.ts` — StatusGroup/Status create (templates: simple/kanban/scrum/ppm),
  get, list-for-space; `createStatusGroupTx` for composition.
- `spaces.ts` — Space/Folder/List CRUD + archive + fractional `reorder()`; each
  space gets a default status group; Activity on every mutation.
- `tasks.ts` — Task CRUD core: create (per-tenant `seq`, default status via
  inheritance, append order), get/getBySeq/list, update (status-change verb),
  soft delete, move, assignee/watcher/tag toggles.

### API (`/api/v1`)
- `POST /spaces`, `PATCH|DELETE /spaces/{id}`, `POST /spaces/{id}/folders`,
  `POST /spaces/{id}/lists`, `GET /spaces/{id}/status-groups`
- `POST /folders/{id}/lists`, `PATCH|DELETE /folders/{id}`, `PATCH|DELETE /lists/{id}`
- `GET|POST /lists/{id}/tasks`, `GET|PATCH|DELETE /tasks/{id}`, `POST /tasks/{id}/move`
- `PATCH /reorder`, `POST /status-groups`
- Zod schemas (`schemas/tasks.ts`, `schemas/statuses.ts`, extended `hierarchy.ts`),
  all `.strict()`; standard `{data}` / `{error:{code,message,fields}}` envelopes.

### Tests & verification
- `tests/rls/hierarchy-crud.test.ts` (5): CRUD flow, seq increment, Activity on
  create + status change, fractional reorder, cross-tenant read = 404.
- Vitest `server-only` alias stub added. **Full suite 78/78 green**; typecheck +
  lint clean.
- **Authenticated HTTP E2E** verified against the running app: login → `POST /spaces`
  → `POST /spaces/{id}/lists` → `POST /lists/{id}/tasks` → `GET` — all 200 with the
  correct envelope; unauthenticated → 401.

### Deferred to later Phase 1 increments
Sidebar tree UI, breadcrumbs, URL scheme, task panel (TipTap description,
checklists, subtasks, dependencies + cycle detection, attachments, threaded
comments), custom fields (18 types), recurring-task worker, quick-create smart
parse, bulk toolbar, status editor UI. These need the new models (Checklist,
Comment, Attachment, FieldDefinition/Value) in a follow-up additive migration.

## Phase 0 — Foundation (2026-07-10)

### Schema & migration (additive)
- Added 12 models + 4 enums to `prisma/schema.prisma`: `Space`, `Folder`, `List`,
  `StatusGroup`, `Status`, `Task`, `TaskDependency`, `Tag`, `TaskTag`,
  `TaskAssignee`, `TaskWatcher`, `Activity`; enums `LocationType`, `StatusType`,
  `Priority`, `DependencyType`. Back-relations added to `Tenant` and `User`.
  Existing PPM tables untouched.
- Migration `20260710120000_clickup_foundation` (with `down.sql` for reversibility)
  and `prisma/rls.sql` updated — every new tenant-owned table has RLS enabled,
  forced, and a `tenant_isolation_*` policy (12/12 verified).

### Server foundation (`src/server/`)
- `tenant-db.ts` — `forTenant()` scoped-query helper + `assertFound()` (→404).
- `errors.ts` — typed errors + `{ error: { code, message, fields? } }` envelope,
  cross-tenant → 404; `ok()` success envelope.
- `hierarchy.ts` — `resolveLocation()`, `resolveStatusGroupId()` (List→Space
  inheritance, memoized), `getHierarchyTree()`.
- `ordering.ts` — fractional `orderIndexBetween()` + `needsRenormalize()`.
- `permissions.ts` — `PermLevel` + `hasLevel()` + `resolveLocationLevel()` /
  `canAccessLocation()` (ancestor + private-space gate; scaffold, see DECISIONS D0.5).
- `realtime.ts` — `emitEvent()` (pg_notify) + shared `LISTEN` fan-out
  (`subscribeToTenantEvents`).
- `queue.ts` — pg-boss bootstrap (`getQueue()`/`enqueue()`).
- `schemas/common.ts` + `schemas/hierarchy.ts` — Zod library (`.strict()`).

### API
- `GET /api/v1/hierarchy` — tenant-scoped sidebar tree.
- `GET /api/v1/events` — SSE stream (Node runtime), tenant-filtered.

### Seed & tests
- Seed extended: demo `Space → Folder → List → tasks` + a `StatusGroup` (6
  statuses) per tenant; `resetTenant` clears the new tables (leaf→root).
- Tests: `tests/unit/ordering.test.ts` (7) and `tests/rls/hierarchy.test.ts` (5)
  — cross-tenant read = 404, no space leakage, inheritance resolution, ordering.

### Dependencies
- Added `pg-boss` (queue) and `pg` (LISTEN/NOTIFY) + `@types/pg`.

### Dev database
- Transformation runs on a **dedicated dev DB** `qubit_clickup` (clean history:
  all PPM migrations + `clickup_foundation`, full seed). Local `.env` repointed
  there; `prisma migrate status` clean. The legacy shared `qubit` DB is left as-is
  (drift + `task` collision from the parallel qubit-ui worktree — DECISIONS D0.6).

### Verification
- `pnpm typecheck` clean · lint clean · **full suite 73/73 green** (via `.env`,
  no override) · migration reversibility exercised (down → 0 tables, up → 12).

### Acceptance (Phase 0)
- ✅ Migration reversible (`down.sql`), fully additive.
- ✅ `GET /hierarchy` returns each tenant's tree only (isolation test proves it).
- ✅ Inheritance resolution + orderIndex insert covered by tests.
