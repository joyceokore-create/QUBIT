# 33 — P2 Execution Spec: Deliver (read-only boards, delivery tab, cross-project dependencies)

**Status:** Execution-ready · 2026-08-04
**Executes:** docs/26 §11 P2 + docs/25 §1/§3/§4 (W2 screens), against the workflow
wireframes (Project workspace → Board / Checkpoints & Rollout).
**Rule:** one milestone at a time, stop for review. DoD per CLAUDE.md + docs/27 §3.
**Out of scope:** the Reports workspace tab and the reporting chain (P3); idea intake (P4).

## 0. The principle this phase enforces

docs/25 §1, confirmed: **QUBIT is a system of record, not a task tracker.** Tasks live in
YouTrack; QUBIT mirrors them read-only. NOBODY authors or edits tasks in QUBIT — not
members, not PMs. This supersedes docs/18 §4 ("anyone on a project can create a task").
Human-authored things that STAY: blockers/RAID, checkpoints & market check-ins (PM),
documents, comments/decisions, reports (P3). System writers that STAY: the YouTrack sync,
the GitHub commit grammar (M7-B), seeds/tests.

Consequence stated plainly: a project with no YouTrack connection has an EMPTY board with
an honest "not connected" state — not a lie, an instruction. Work exists when the tracker
is connected (wizard step 6 or workspace → Integrations).

## 1. Current state (recon 2026-08-04)

| Concept | Today | P2 target |
|---|---|---|
| Project board | 5 QUBIT status columns, drag-to-move, add-task button, edit dialogs (`project-board.tsx`) | **read-only**: To do / Doing / Done lanes AS VIEWS over YouTrack states; no create/move/edit affordances for anyone |
| Task authoring API | `createProjectTask`/updates allowed on non-connected projects (`assertNativeTasksAllowed`) | human authoring routes retired (403 with a pointer to YouTrack); system paths (sync, webhook) untouched |
| Sync health | Integrations tab only (`lastSyncAt`, error) | board header badge: "🔗 Synced from YouTrack · Nm ago" / amber "stale >2× interval" / red error / grey "not connected" |
| Mine/All | members locked to their lane (DM1.43) | keep lenses; members additionally get **Mine ▾ / All** within their lane (docs/25 §4) |
| Workspace tabs | Overview · Board · Documents · Deadlines · Team · Integrations (checkpoints live on Overview) | + **Checkpoints & Rollout** tab (matrix + market tracks + market check-ins move there); Overview slims to details + latest report + RAID |
| Cross-project deps | none (task-level exists, M7-A) | `ProjectDependency` A-waits-on-B, cycle-checked; workspace panel + portfolio "what's blocking what" |

## 2. Milestones

### M-P2a — The one read-only board

- **Lanes become views over YouTrack states** (docs/25 §4): To do = Open · Doing =
  In Progress/In Review/In QA · Done = QA-passed/Completed. Pure mapping in
  `src/lib/board-lens.ts` (`laneOf(status): "todo"|"doing"|"done"`), unit-tested; the
  Blocked flag stays a card badge, never a column.
- **Authoring dies in one place**: `project-tasks.ts` gains `TASKS_READ_ONLY` enforcement
  — human create/update/move routes return `TASKS_ARE_MIRRORED` (403 + "tasks live in
  YouTrack"); the board UI drops add/drag/edit affordances for every role (view dialogs
  stay). System callers (sync upserts, M7-B transitions) use their existing internal
  paths and are untouched — pinned by tests both ways.
- **Sync health on the board header**, all four states (fresh/stale/error/not connected);
  stale = now − lastSyncAt > 2× syncIntervalMinutes. "Not connected" links the PM to
  Integrations, members get plain text.
- **Mine ▾ / All** toggle for members inside their locked lens (PM keeps the four lenses).
- `/board` (personal) follows the same read-only rule — cards deep-link into workspaces.
- Tests: lane mapping table; human-write 403s (member AND PM); sync/webhook writes still
  land; badge state derivation (pure).

### M-P2b — The Checkpoints & Rollout tab

- New workspace tab between Documents and Team: checkpoint matrix (PM-editable states,
  derived %, gate rules + overrides — all existing M-D-A/M8-A pieces relocated), market
  tracks + per-market check-ins (M-D-B relocated), rollout heat strip for Rollout
  projects.
- Overview slims: details card (with the §0.2 budget line), latest confirmed check-in
  narrative, milestones, RAID. The checkpoint editor LEAVES Overview.
- Pure relocation + composition — no engine changes; deep links (`?tab=Delivery` aliases
  the old anchors) keep old nudge/notification links working.
- Tests: tab composition per role (PM edit vs member view) — existing checkpoint tests
  keep passing untouched (proof it was a move, not a rewrite).

### M-P2c — Cross-project dependencies

- Schema: `ProjectDependency` (tenantId, projectId, dependsOnProjectId, note?, createdById,
  timestamps; unique [projectId, dependsOnProjectId]; RLS inline; both FKs cascade).
- Engine `src/server/project-dependencies.ts`: add/remove (PM-of-project or Head, audited,
  evented + notify the other project's PM), **cycle detection reusing the M7-A pattern**
  (BFS over edges before insert, `DEPENDENCY_CYCLE`), `blockingMap(ctx)` — the
  portfolio-level "what's blocking what": edges where the depended-on project is not
  Completed, grouped by portfolio, worst-health first.
- UI: workspace Overview RAID card gains a "Waits on" row (add/remove for PM); the
  portfolio detail page gains a "Blocking map" panel when edges exist.
- Tests: cycle refusal (direct + transitive), RLS, dependency add audit/notification,
  blockingMap shape.

### Sequencing

M-P2a → M-P2b → M-P2c, stop-for-review each. M-P2a is the behavioural break (authoring
retired) — it ships first so the phase's principle is enforced before surfaces move.

## 3. Risks named up front

- **M-P2a removes a capability people may be using** (native tasks on non-connected
  projects). The 25 seeded/live projects' existing tasks REMAIN visible and continue to
  flow through check-ins/nudges/reports; they just stop being editable in QUBIT. If a
  live project needs task edits before its YouTrack connection exists, that is a
  prioritisation conversation, not a hidden toggle.
- Friday drafts, nudger, velocity chips all READ tasks — unaffected by write retirement
  (verified by the existing suites staying green).

## 4. Definition of done (per milestone)

Wireframe-matched or DECISIONS-noted; RAG parity untouched; system write-paths proven
alive after the human paths close; lint/typecheck/test green; browser-verified per role;
DECISIONS entry; deploy verified on the box.
