# 18 — Delivery Tracking, Personal Boards & Reporting Workflow

**Status:** Proposed · 2026-07-28
**Owner:** Joyce Okore
**Source of truth for shapes:** supervisor's portfolio slides (30 Jun 2026) + Teams
confirmation (28 Jul 2026). Refines `16-revamp-plan.md` and supersedes parts of
`17-role-dashboards-spec.md` §2 (noted inline there).
**Audience:** Claude Code. One milestone at a time; DoD per `CLAUDE.md`.

---

## 0. Confirmed decisions from the business (record in DECISIONS.md)

1. **KPI strip is removed from the dashboard top level.** Its stats (budget, risks,
   milestones, velocity, health, resources) are represented **per project** — chips on
   each project row/card — not as global tiles. (Supervisor, Teams 28 Jul.)
2. **Pipeline stages are the real ones:** `Exploring → Evaluating → Approved` (+
   `Paused`), replacing the invented lifecycle names in 16-revamp §6. Delivery
   checkpoints are per-project-type templates (§2).
3. **Riverbank tracks delivery across KCB markets** (Kenya, Tanzania, Uganda, Rwanda,
   Burundi, S Sudan, DRC). This resolves the "Group Project → Country Based" open
   question in `docs/14` — it is a confirmed requirement. Markets are a *delivery*
   dimension, not Riverbank's internal org structure (DM1.1 stands: Riverbank stays
   flat internally).
4. **Target report types** (must be producible in the reports module, print/PDF-ready):
   R1 portfolio pipeline status, R2 project × market "where we are" matrix, R3 market
   focus & blockers. See §5.
5. **Every project belongs to a portfolio** (owner-confirmed 2026-07-28). Seed one
   default **"Unassigned"** portfolio per tenant (`viewKind: Pipeline`); standalone
   projects are backfilled into it (data migration — DM1.18 tenant-loop pattern).
   `Project.portfolioId` becomes required at creation (picker defaults to Unassigned).
   The `/standalone` route and nav concept are removed; the dashboard renders
   Unassigned as the last portfolio section, only when non-empty. Moving a project
   between portfolios is a normal audited edit (workspace → Overview, PM/heads/execs).

## 1. Pipeline stages (portfolio classification)

- `Project.pipelineStage`: `Exploring | Evaluating | Approved | Paused`. Zod-validated,
  audited on change, stage-change writes a `DomainEvent`.
- Grouped exactly as the slide: the **portfolio pipeline table** lists projects grouped
  by stage with: name, description, priority, checkpoint ticks, %, latest status comment
  (from the project's most recent check-in).
- Appears on: executive dashboard (all portfolios), other personas (filtered to their
  projects), and the Reports page (everyone, read-only — global read per DM1.3).
- The old flat `Project.priority` enum stays as the Priority column
  (`High | Med | Low | New | Strat | Paused` — extend enum to match business usage).

## 2. Delivery checkpoints (templates, not hardcoded columns)

Different portfolios march through different gates, so checkpoints are data:

- `CheckpointTemplate` (tenant-scoped, admin-editable): name + ordered checkpoint list.
  Seed two from the slides:
  - **Product build:** BRD → Prototype → MVP1 → SIT → UAT → Go-Live
  - **Market rollout:** Business Case → Contract → Solution Build → Bank Integration →
    Telco Integration → Testing → GTM/Pilot → Rollout
  - (⚠ CORRECTED 2026-07-28: the earlier "channel rollout" template was wrong —
    POS/USSD/Agent Portal/Mobile App are **child projects of the Swipe portfolio**
    (§3.0), not checkpoints. A status-only track uses a minimal single-checkpoint
    template, e.g. `Rollout`.)
- A project picks one template. Checkpoint state per unit of tracking:
  `Done | InProgress | NotStarted | Blocked` (Blocked = linked open Blocker, reason
  required — same flag pattern as tasks).
- **% complete is derived** (weighted count of Done/InProgress), never typed. The slide's
  hand-maintained percentages become computed and therefore always current.

## 3. Portfolio hierarchy, markets and rollout tracks

### 3.0 The hierarchy (governs all grouping)

```
Portfolio  (AI Initiatives · ZED ERP · Swipe Agent Banking · …)
 └─ Project / module          (Fikra, Checksmart… · ZED Card, ZED Teller… · POS, USSD,
    │                          Agent Portal, Mobile App)
    ├─ pipelineStage + checkpoint progress          (the "pipeline" lens)
    └─ MarketTrack per subsidiary (KE TZ UG RW BI SS DRC)
        └─ CheckpointStatus per checkpoint + market check-in   (the "rollout" lens)
```

- Uses the existing `Portfolio → Project` relation — no new hierarchy model. Modules
  (ZED Card, Swipe POS) are ordinary child Projects of their portfolio.
- **`Portfolio.viewKind: Pipeline | Rollout`** (admin-editable) declares the portfolio's
  native lens: AI Initiatives = `Pipeline` (stage-grouped table); ZED and Swipe =
  `Rollout` (project × market heatmap). Both lenses are available on drill-down; the
  viewKind only picks the default.
- Roll-ups are derived bottom-up: market-track % → project % → portfolio % / RAG
  (worst-of or weighted — use the health engine, one function).

### 3.1 Markets and rollout tracks

- `OrgUnit.kind`: `Internal | Market` (new field). Seed the seven KCB markets as
  `Market` org units in the Riverbank tenant. The "Subsidiaries" nav-hiding rule keys on
  `Internal` units only, so Riverbank stays flat internally while gaining markets.
- Reuse `ProjectOrgStatus` as the **market track** (project/module × market): it already
  hangs off OrgUnit. Extend it with checkpoint statuses (`CheckpointStatus` rows keyed
  track × checkpoint) and a weekly **market check-in**: one narrative paragraph
  ("focus & blockers"), a RAG, and % (derived). Do NOT create a parallel model — one
  track model, extended (same reasoning that killed the second task system).
- Executive **rollout heatmap** (per Rollout portfolio) = child-project rows × market
  columns; cell = derived state/% + WoW delta from snapshots; click a cell → that
  project-market's checkpoint matrix + focus & blockers card (the "Where We Are" +
  "Critical Focus" slides as one live page). A portfolio-level summary row sits on top.

## 4. Personal boards (Trello/YouTrack-style)

**Route `/board` — every user gets their own board page** (nav item "My Board"; this
replaces `/my-tasks` as the daily surface — keep the route as a redirect).

- **Lanes: To do · Doing · Done.** These are *views over* the 5-status taxonomy, not new
  statuses: To do = `NotStarted`; Doing = `InProgress | InReview | InQA` (sub-badge shows
  which); Done = `Completed`. The taxonomy (docs/15 6.1) is untouched.
- **Grouped by project**: project tabs/sections; "All" shows everything assigned to me.
- **Anyone on a project can create a task and assign it to any project member** (this is
  already the DM1.11 membership-write rule). On assign: in-app notification + (M5) email
  to the assignee, and the task appears in their To do lane with an "added by <name>"
  chip.
- **Status-change notifications go back to the reporter/assigner**: moving a task
  notifies `reporterId` (and watchers later). Both sides of the handoff see the same
  card — deep links `?task=<id>` already exist.
- **Completion rules by task type** (keeps QA integrity without blocking ad-hoc work):
  - `Feature | Bug`: assignee can move to Doing/In review; **QA owns Completed**
    (docs/15 rule). The lane shows "with QA" until QA passes it.
  - `Chore | Spike | Improvement` (ad-hoc/action items): assignee completes directly.
- **Not a visibility wall** (DM1.3 / DM1.20): the personal board is the *default* view.
  Project boards (`/projects/[id]?tab=Board`) remain for PM triage, QA queues, and
  cross-member handoffs. A PM who can only see their own board cannot run a project.
- The **Done lane feeds the weekly report** (§5) — this is the loop that makes board
  hygiene self-rewarding.

## 5. Reporting module v2

### 5.1 Member weekly report (generate → edit → submit)

1. **Auto-draft** every Friday (cron, 16-revamp M2): built from the member's board —
   Done this week, Doing + aging, blockers raised/resolved, per project. Draft is
   visible only to the member.
2. **Edit step is mandatory UX** (never auto-send): composer shows the draft with
   per-project sections, "add more details" prompts, free-text comments, and lets the
   member reorder/annotate. AI assist (Q) may tidy prose; content stays human-approved.
3. **Submit → routes to the project lead(s)** (PM = team lead per project; multi-project
   members submit one report, each PM sees their project's section). States:
   `Draft → Submitted → Acknowledged`. Stored as `SharedReport` snapshots; audited.
4. PM acknowledges + can comment; acknowledged member reports roll up into the PM's
   **project check-in** (16-revamp §7), which feeds the exec digest.
5. Not submitted by Monday 10:00 → nudge (M3); exec digest marks affected projects
   "member reports incomplete".

### 5.2 Reports page (all personas)

- **Everyone sees portfolio/project status** (global read): pipeline table (R1) and
  market matrices (R2/R3) as live, read-only views with period selector.
- **Scoped pulls** stay permission-gated (existing `canAccessReport`): execs/heads pull
  any person's weekly activity, projects-they're-on, workload; PMs their project
  members; members self.
- Report types registry: R1 pipeline status, R2 project × market matrix, R3 market
  focus & blockers, plus existing person/project/portfolio/delivery Q reports and
  member weekly reports. All print-ready HTML/PDF; CSV where tabular; PPT later
  (16-revamp §9).

## 6. Executive dashboard v3 (supersedes 17 §2 layout, keeps its rules)

**The dashboard is grouped by portfolio.** Top → bottom: **hero + decision queue**
(unchanged from 17), then **one section per portfolio**, ordered by worst health.

Each portfolio section: a header row (name · RAG + Δ · derived % · open blockers count
· owner) and a body rendered by `viewKind`:

- `Pipeline` (e.g. AI Initiatives): the stage-grouped pipeline table (§1) — Approved /
  Evaluating / Exploring headers with counts; rows carry checkpoint ticks, %, priority,
  status note, and the per-project stat chips (decision №1).
- `Rollout` (e.g. ZED ERP, Swipe): the project × market heatmap (§3) with its
  portfolio summary row; a "top blockers" strip beneath it (from market check-ins).

Sections are collapsible; collapsed shows only the header row, so an exec scans all
portfolios in one screen and expands the sick one. No global KPI tiles anywhere.

Other personas get the **same portfolio sections, filtered**: only portfolios
containing their projects, and within each section only their rows (scope toggle to
"all" per DM1.20 — filter, not wall). Same components, scoped query. The Reports page
shows every section read-only for everyone (DM1.3 global read).

## 7. Edit surfaces — who updates what, where

Rule: **humans update facts, the system derives numbers.** Every field a dashboard
shows either (a) is editable on the project workspace by the right role, or (b) is
derived from such fields. Nothing on a dashboard is dead data with no edit path.

| Field (shown on dashboards) | Edited where | Who | Notes |
|---|---|---|---|
| Pipeline stage (`Exploring/Evaluating/Approved/Paused`) | Workspace → Overview, inline select | PM/lead, heads, execs | audited + evented; stage change appears in exec delta feed |
| Priority | Workspace → Overview, inline select | PM/lead, heads, execs | |
| Checkpoint states (✓ ◐ ✗ per gate) | Workspace → **Delivery tab** matrix — click a cell to set `Done/InProgress/NotStarted/Blocked` | PM/lead (+ implementor lead for market rows); heads | `Blocked` requires a linked Blocker with reason; % recomputes instantly |
| Status/comment column | Workspace → Overview "status note" (one line), or auto-filled from latest check-in | PM/lead | the check-in (16-revamp §7) is the weekly prompt; the field is editable any day |
| Market check-in (narrative + RAG) | Delivery tab → per-market card, edit-in-place | PM/lead, market implementor | feeds R3 report + exec blockers widget |
| Project RAG/health | **not editable** — computed by `health.ts` | — | lead override only via check-in, with reason + 7-day expiry (16-revamp §7) |
| % complete (pipeline + per market) | **not editable** — derived from checkpoint states | — | |
| Stat chips (risks, milestones, velocity, resources) | derived from their own entities (risks CRUD, milestones, tasks, allocations) | owners of those entities | budget chip returns only when money is typed (Phase C) |

- All edits are inline on the workspace (click-to-edit, optimistic UI), Zod-validated,
  audited, and emit `DomainEvent`s — dashboards update via snapshot/SSE without any
  separate "update the dashboard" step.
- Executives can edit governance fields (stage, priority) from the drill-down panel too
  — same components, same gates (`can()` decides, never the surface).
- If a field has no edit surface, it must not appear on a dashboard. This is an
  acceptance rule (§10).

## 8. Data model summary

| Model | Change | Notes |
|---|---|---|
| `Portfolio` | `viewKind: Pipeline \| Rollout` | admin-editable; picks default lens |
| `Project` | `pipelineStage`, extend `priority` enum | audited, evented; modules = child projects of a portfolio (existing relation) |
| `CheckpointTemplate`, `Checkpoint` | new | tenant-scoped, seeded ×3 |
| `OrgUnit` | `kind: Internal \| Market` | seed 7 KCB markets |
| `ProjectOrgStatus` | extend: checkpoint statuses, market check-in (narrative, RAG) | reuse, don't duplicate |
| `CheckpointStatus` | new | track × checkpoint state |
| `MemberReport` | new | isoWeek, state machine, per-project sections, → `SharedReport` |
| `ProjectTask` | no schema change | lanes are views; reporter notifications via events |

All tenant-scoped + RLS + isolation tests; migrations follow DM1.18; every mutation and
machine actor audited.

## 9. Build order (slots into 16-revamp milestones)

1. **M1 (Dashboard v2→v3):** pipeline stage field + pipeline table + per-project stat
   chips + KPI strip removal. Heatmap ships market-aware if M-D is done, else
   department-axis first.
2. **M-D (new, after M2): Delivery matrix** — checkpoint templates, market org units,
   track extension, market check-ins, rollout heatmap + drill-down, R2/R3 report views.
3. **M2 (Weekly loop):** add the member report composer + submit/acknowledge routing
   (§5.1) on top of the planned `ReportSubscription` work.
4. **M4 (Collaboration):** the assign/notify handoffs land here (comments/@mentions +
   reporter notifications).
5. Personal boards (§4) are UI over existing data — schedule as **M1b** with the
   developer preset (17 §8).

## 10. Acceptance criteria (delta to 16/17)

- Pipeline table groups match the slide exactly (stage headers with counts, gate ticks,
  %, priority, comment) and render live for both tenants; % values are derived, never
  stored-typed.
- A member assigned a task by QA sees it in To do with attribution; completing it (per
  type rules) notifies the assigner; both views update without refresh (SSE).
- Friday: every active member has a draft; submitting routes to the correct PM(s);
  PM acknowledgment rolls into the project check-in; an exec can open R1/R2/R3 and any
  person's weekly report Monday morning.
- Reports page: a developer can read all portfolio/project status but cannot pull
  another person's weekly report (permission test both ways).
- No global KPI tiles render on any preset; project rows carry the stat chips.
- Zero portfolio-less projects exist after migration (assert in an RLS test for both
  tenants); the Unassigned section renders only when non-empty; `/standalone` is gone.
- **Every non-derived field on any dashboard has an edit surface on the project
  workspace** (§7 table is the checklist): a PM can change stage, priority, a checkpoint
  state, the status note, and a market check-in from the workspace, and each change is
  audited, evented, and visible on the exec dashboard without manual refresh. A user
  without the gate sees read-only fields (test both ways).
