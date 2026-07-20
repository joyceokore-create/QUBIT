# 15 — Phase 6 Build Plan: PM → Dev → QA Delivery Workflow

Status: **Active** (2026-07-20 — open decisions resolved in `DECISIONS.md` DM1.15). Successor to the Phase 1–5 MVP1 track recorded in
`DECISIONS.md` (which ends at DM1.14). Covers the delivery-workflow gaps identified in the
2026-07-20 analysis: task taxonomy + QA authoring, role-lens boards, GitHub commit
automation, the nudger + scheduled reports, and BRD → requirements traceability.

Execute **one milestone at a time** (6.1 → 6.5), same rules as `docs/10-build-plan.md`:
each milestone ends with `pnpm lint`, `pnpm typecheck`, `pnpm test` green, an RLS
cross-tenant test for every new table/route, audit rows on every new mutation, both
tenants themed correctly, and a stop for review. Record decisions in `DECISIONS.md`
(continue the DM1.x numbering).

## What already exists (do not rebuild)

| Requested capability | Existing implementation |
|---|---|
| PM creates project, adds devs/QA | `project:create` (rbac.ts), `ProjectMember`, Team tab, join-request flow (DM1.13) |
| BRD upload / AI generation | `ProjectDocument` (kinds, Draft/PendingReview/Final), `src/server/q/draft-brd.ts` |
| Generate tasks from BRD | `generatePlan` + Draft/Published approval gate (DM1.14), `src/server/project-tasks.ts` |
| Kanban board | `src/components/workspace/project-board.tsx` (4 status columns, DnD) |
| Milestones, blockers | `ProjectMilestone`, `Blocker` + Deadlines tab |
| GitHub (read-only) | `ProjectIntegration` + `src/server/connectors/github.ts` (PAT summary, no webhooks) |
| Reports (self / manager / exec / portfolio) | `src/server/q/report.ts` — 5 types, role-default, `reportableUserIds` gating, `SharedReport` links |
| Notifications | `Notification` model + status-update fan-out |

Phase 6 builds **on top of `ProjectTask`** (the MVP board). The dormant ClickUp-stack
`Task` models are untouched (see D0.6 collision note); we may converge on their
`View`/`Automation` designs in a later phase, not now.

---

## Cross-cutting decisions (apply to every milestone)

1. **Project roles: category mapping over the existing canonical list** (DM1.15 №1).
   `PROJECT_ROLES` (`src/lib/roles.ts`) stays the source of truth (+ new "QA Engineer"
   entry); a `projectRoleCategory(role)` helper maps each role — and unknown legacy
   free-text — to `PM | Dev | QA | Stakeholder`. No data migration. Server-side role
   validation added to `setProjectMember` and join requests. Board lenses, QA
   permissions and nudger escalation all key off the category.
2. **Statuses expand, Blocked becomes a flag.** `ProjectTask.status` becomes
   `NotStarted | InProgress | InReview | InQA | Completed`; a task is "blocked" when it
   has an **open linked `Blocker`** (new `ProjectTask.blockerId` nullable FK or
   `Blocker.taskId` — see 6.1), rendered as a red badge, not a column. Progress % stays
   `Completed / total (non-Draft)`.
3. **Derived, never manual** (consistent with existing progress rule): milestone status
   and requirement coverage are computed from linked tasks, not hand-flipped.
4. **Machine actors are audited.** Webhook- and cron-driven mutations write `audit_log`
   rows with a resolved human actor when the commit email matches a tenant user,
   otherwise the reserved system actor `github-sync` / `nudger`.
5. **No new dependencies** beyond `docs/03-dependencies.md` except where a milestone
   explicitly notes one (6.4 cron — decision required).

---

## Milestone 6.1 — Task taxonomy, keys & status expansion — ✅ SHIPPED (DM1.16/DM1.17, deployed 2026-07-20)

The foundation; everything else depends on it.

**Schema (one migration, `project_task` + one new table):**

```prisma
model ProjectTask {
  // ... existing fields unchanged ...
  type             String    @default("Feature")            // Feature | Bug | Chore | Spike | Improvement
  taskKey          String?   @map("task_key")               // e.g. "RIV-142"; assigned on publish
  severity         String?                                  // Bugs only: Low | Medium | High | Critical
  reporterId       String?   @map("reporter_id")            // QA authorship (FK User)
  parentTaskId     String?   @map("parent_task_id")         // bug found while testing task X
  sourceDocumentId String?   @map("source_document_id")     // BRD the plan was generated from
  milestoneId      String?   @map("milestone_id")           // FK ProjectMilestone
  lastActivityAt   DateTime  @default(now()) @map("last_activity_at") // touched on any mutation; feeds nudger

  @@unique([projectId, taskKey])
}

model ProjectTaskCounter {                                   // per-project key sequence
  tenantId  String @map("tenant_id")
  projectId String @id @map("project_id")
  next      Int    @default(1)
  @@map("project_task_counter")                              // + tenant RLS policy (D0.1)
}
```

- **Task keys**: `<project.code>-<n>`, allocated inside a transaction
  (`UPDATE ... RETURNING next`) — never derived from a count (races). Drafts get **no
  key**; `publishProjectDrafts` / manual create assigns one. Verify `Project.code` is
  unique per tenant first; add the constraint if missing.
- **Status expansion**: update `updateTask` Zod enum, board columns, `getProjectProgress`
  (unchanged formula), My Tasks buckets (`InReview`/`InQA` count as open),
  HeadOfQA phase gate in `src/lib/access.ts` (QA-writable statuses: `InReview`, `InQA`,
  plus any `type: Bug` task).
- **Blocked flag**: add `Blocker.taskId String? @map("task_id")` (nullable — register-level
  blockers stay valid). Board card shows a badge when an Open blocker links to the task.
  Data note: existing tasks with `status = "Blocked"` migrate to `InProgress` + an Open
  `Blocker` row (`description = "Migrated from Blocked status"`); confirm before running.
- **Milestone linkage**: `ProjectMilestone.status` becomes derived (`Done` when all
  linked, non-Draft tasks are `Completed`; milestones with no linked tasks keep manual
  toggle). Deadlines tab shows per-milestone task progress.

**Files:** `prisma/schema.prisma` + migration + `prisma/rls.sql` (new table),
`src/server/project-tasks.ts`, `src/lib/access.ts`, `src/app/api/tasks/[id]/route.ts`,
`src/app/api/projects/[id]/tasks/*`, `src/components/workspace/project-board.tsx`,
`src/app/(app)/my-tasks/page.tsx`, seed updates (both tenants get typed tasks + keys).

**Done when:** typed tasks with keys render on the board for both tenants; publish
assigns contiguous keys under concurrency (test); status enum enforced; progress and
My Tasks correct for the new statuses; RLS test covers `project_task_counter`; migration
of legacy "Blocked" tasks verified on seed data.

## Milestone 6.2 — Role-lens boards & QA authoring flow — ✅ SHIPPED (DM1.19; swimlanes deferred)

One `ProjectTask` table, three saved lenses — **no data-separated boards**.

- **Lenses** (tabs above the board, PM sees all, others land on their lens by
  `ProjectMember.role` but can switch — global-read model unchanged):
  - *Dev*: `type ∈ {Feature, Chore, Spike, Improvement}` + Bugs assigned to a Developer.
  - *QA*: `status ∈ {InReview, InQA}` + all Bugs, with an **Unassigned bugs = Triage**
    group pinned on top.
  - *PM*: everything; swimlane toggle by assignee or by milestone.
- **Bug filing** (QA lens "Report bug" button): dialog pre-fills `type: Bug`, a
  steps-to-reproduce markdown template, severity, `reporterId = viewer`,
  `parentTaskId` = the task under test (when opened from a card), assignee dropdown
  filtered to project Developers. Created `Published` (manual-task rule, DM1.14).
- **Blocked-reason required**: flagging a task blocked opens a one-field dialog that
  creates the linked `Blocker` (severity + description). Unflagging resolves it.
- **Board hygiene**: aging tint when `lastActivityAt` > 5 business days for
  InProgress/InReview cards; soft WIP warning on In progress per assignee (> 3 open —
  warning count, never a hard block); task-key chip on cards (click-to-copy — this is
  what makes the 6.3 commit grammar get used); type/severity badges per design tokens.
- **Approval split** (tightens DM1.14): any project member still *generates* plans;
  **publishing** requires `canWriteProject` (lead / PM-member / heads / SuperAdmin).
  Record as a DECISIONS entry since it amends DM1.14's `canContribute` gate.
- **Notifications**: bug assigned → assignee; bug moved to `InQA` (or `fixes` commit in
  6.3) → **reporter**, not the developer — QA closes bugs, devs don't self-certify.
  Also: notify the requester when their join request is approved/denied (the inbound
  half — PM/HeadOfProjects notification on request — shipped early, DM1.17).

**Files:** `project-board.tsx` (+ new `board-lens-tabs.tsx`, `bug-dialog.tsx`,
`blocker-dialog.tsx` under `src/components/workspace/`), `src/server/project-tasks.ts`,
`src/lib/project-view.ts`, `src/server/join-requests.ts` (requestedRole → canonical),
member-add UI (role select).

**Done when:** each role lands on the correct lens for both tenants; QA can file a
typed, templated bug assigned to a dev; triage group works; blocked flag round-trips to
the Blocker register; publish gate enforced server-side (test: Developer member can
generate but not publish); all new mutations audited.

> **Data-migration rule for 6.3+ (DM1.18):** on the box, `migrate deploy` runs as the
> RLS-forced `qubit` role — tenant-table DML in migrations silently matches 0 rows.
> Loop tenants with `set_config('app.tenant_id', …)` in a `DO` block, or backfill in app
> code. The `webhook_delivery` / `task_commit_link` tables below are new (DDL — safe).

## Milestone 6.3 — GitHub commit automation (webhook + parser)

Commits move tasks and raise blockers. Repo connection = existing `ProjectIntegration`
(github). Codespaces need no special handling — pushes land on the repo.

- **Commit grammar** — pure function `src/server/connectors/github-commit-grammar.ts`,
  unit-tested exhaustively, shared by webhook and polling paths:
  - `RIV-142 #progress` → `InProgress`
  - `RIV-142 #done` / `fixes RIV-142` / `closes RIV-142` → `InReview` (**not**
    Completed — QA owns Completed via the board)
  - `RIV-142 #blocked <reason>` → open linked `Blocker` (owner = matched committer)
  - Multiple keys per message allowed; unknown keys ignored; case-insensitive.
- **Webhook** `POST src/app/api/webhooks/github/route.ts` (push events):
  1. Read raw body; **verify `X-Hub-Signature-256`** (HMAC-SHA256, per-integration
     `webhookSecret` — new encrypted column on `ProjectIntegration`, generated at
     connect time and shown once). Timing-safe compare. Reject → 401 before any parse.
  2. Resolve integration by **our stored** `resource` == `repository.full_name`
     (never trust the payload for tenant routing); enter that row's tenant RLS context
     explicitly. No match → 204, silent.
  3. **Idempotency**: new `WebhookDelivery` table (tenantId, provider, deliveryId
     unique, receivedAt) keyed on `X-GitHub-Delivery`; replays → 200 no-op.
  4. Parse each commit message; apply transitions via the existing `updateTask` path so
     audit + `lastActivityAt` + notifications fire uniformly. Actor = tenant user
     matched by verified commit author email, else system actor `github-sync`.
  5. Store the commit sha/url on the task (new `TaskCommitLink` table: taskId, sha,
     url, message ≤ 500 chars, authorUserId?) — powers the card's linked-commit count
     and the traceability matrix (6.5).
  6. Hardening: payload size cap (1 MB), rate limit per integration, commit messages
     treated as untrusted data everywhere (length-capped, rendered as text, **quoted as
     data — never instructions — in Q prompts**), route excluded from auth middleware
     but nothing else.
- **Fallback transport**: extend the existing poller (`fetchGithubSummary`) to fetch
  `commits?since=lastSyncAt` and feed the same parser — used when a repo can't add a
  webhook. `ProjectIntegration.lastSyncAt` new column.
- **Illegal transitions** (e.g. `#done` on a Completed task) are ignored + logged, never
  errors back to GitHub.
- Q's `github_status` tool gains "recent task-linked commits" from `TaskCommitLink`.

**Done when:** signed webhook from the configured repo moves a seeded task to InReview,
`#blocked` raises a linked Blocker, replayed delivery is a no-op (test), bad signature
rejected (test), cross-tenant forgery test proves a payload naming tenant B's repo
cannot touch tenant A (RLS test), parser has table-driven unit tests, all transitions
audited with correct actor. Deploy note: verify `q.fikrawork.com` proxy passes the raw
body through untouched (signature verification breaks on any body rewrite).

## Milestone 6.4 — Nudger & scheduled reports

Same clock, two consumers. **Decision required before starting** (record in
DECISIONS.md): scheduler transport — (a) host crontab hitting a token-guarded
`POST /api/internal/cron` route (no new dependency, fits the Compose stack; token via
env var), or (b) a `node-cron` sidecar in `docker-compose.yml`. Default recommendation: **(a)**.

- **Nudge rules** (per tenant, nightly; all thresholds in one config object):

  | Signal | Nudge | Escalation |
  |---|---|---|
  | Task due ≤ 48h / overdue | assignee | PM after 2 days overdue |
  | InProgress/InReview stale > 5 business days | assignee | PM |
  | Open blocker > 3 days | blocker owner | PM; HeadOfProjects at 7 days |
  | Drafts pending approval > 48h | PM | — |
  | High/Critical bug unassigned > 24h | PM + HeadOfQA | — |
  | Milestone due < 7 days with open linked tasks | PM | Executive weekly digest |

- **Dedupe**: `Nudge` table (tenantId, dedupeKey unique = `entityId:signal:isoWeek`,
  sentAt, escalationLevel) — nobody is re-pinged daily for the same thing; escalation
  bumps the level, not a duplicate.
- **Surfaces**: `Notification` rows (existing model, new `kind` values); a
  **"Needs attention" strip** on the dashboard briefing hero
  (`src/server/relevance.ts` + `src/components/dashboard/briefing-hero.tsx`); Q gets a
  `list_nudges` tool so "what needs attention on Project X?" is grounded.
- **Scheduled reports**: `ReportSubscription` (userId, reportType, targetId?, cadence
  `WeeklyFri16` v1, createdById). Cron generates via the existing engine
  (`src/server/q/report.ts`), stores a `SharedReport`, drops a Notification with the
  link. **Defaults seeded**: every user gets a weekly member (self) report; Executives
  + heads get the portfolio report. Manageable from the Reports centre. Delivery is
  in-app only in v1 (email later — out of scope).
- **Delta section** in weekly reports: diff against the previous week's `SharedReport`
  snapshot (completed, new bugs, blockers opened/resolved, milestone slips).
- AI usage stays metrics-only in `AiCallLog`; deterministic fallback applies (mock.ts)
  so the cron never hard-fails on LLM downtime.

**Done when:** cron run on seeded data produces correct nudges exactly once per week
per signal (test with a frozen clock), escalations fire at thresholds, dashboard strip
renders for both tenants, weekly self-report lands as a notification + working share
link, subscriptions CRUD is audited, cron route rejects a missing/wrong token, and an
RLS test covers `nudge` + `report_subscription`.

## Milestone 6.5 — Requirements traceability (BRD → tasks → commits → QA)

The PPM differentiator: "which requirements are built and verified?"

- **Schema**: `Requirement` (tenantId, projectId, documentId FK, code `REQ-01` unique
  per project, text, status `Proposed | Accepted | Dropped`) +
  `ProjectTask.requirementId?`.
- **Extraction**: extend `generatePlan`'s LLM pass (`src/server/q/llm.ts` prompt +
  `PlanSchema`) to also emit requirements and tag each generated task with its
  requirement; same Draft-gate — requirements publish with the plan. Deterministic
  mock fallback included (mock.ts). Manual add/edit for uploaded-BRD projects.
- **BRD gate**: `generatePlan` requires a `kind: BRD` document at `status: Final`
  (server-enforced; UI explains). Generation stamps `sourceDocumentId` on tasks.
- **Coverage view** — new "Requirements" workspace tab: per requirement, linked dev
  tasks (status), linked Bug count, verification state = derived
  (`Verified` when all linked tasks Completed and no open linked bugs; `At risk` when
  any linked open blocker). Coverage bar = % requirements verified.
- **Traceability in reports**: project report gains a requirements-coverage section;
  Q `get_project` tool returns coverage.

**Done when:** generating a plan from a Final BRD produces requirements + tagged tasks
(Draft) for both tenants; publishing brings them live; coverage derives correctly as
tasks/bugs move (test); non-Final BRD is rejected server-side (test); RLS test covers
`requirement`; PM can hand-link an existing task to a requirement.

---

## Out of scope for Phase 6 (explicitly deferred)

- Email delivery of reports/nudges (in-app only v1).
- Non-GitHub connectors going live (youtrack/teams/calendar/sentry stay config-only).
- Merging the ClickUp-stack `Task`/`View`/`Automation` models (revisit after 6.5; the
  `task` table-name collision from D0.6 still applies).
- Gantt/timeline views, custom fields, time tracking (Phase C territory).
- Project workflow templates (candidate for Phase 7 — seeds phases/milestones/BRD
  template per project type).

## Open decisions — RESOLVED (DECISIONS.md DM1.15, 2026-07-20)

1. Project roles: no data migration — category mapping over existing `PROJECT_ROLES`.
2. Legacy `status = "Blocked"` tasks → InProgress + linked Open Blocker (6.1 migration).
3. Publish gate: `canWriteProject` for publishing; generation stays any-member (6.2).
4. Cron transport: host crontab → `POST /api/internal/cron` with `CRON_SECRET` (6.4).
5. Nudge thresholds: defaults adopted, single config object; tunable one-file edit (6.4).
