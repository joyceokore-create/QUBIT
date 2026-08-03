# 25 — Delivery & Reporting Workflow Spec (Ideation → Rollout)

**Status:** Design · 2026-08-03
**Owner:** Joyce Okore
**Pairs with:** `docs/wireframes/qubit-workflow-wireframes.html` (interactive wireframes)
**Sources:** `docs/24` (handwritten notes), `docs/17/18/19`, chat decisions 2026-08-03
**Execution rule:** one milestone at a time, stop for review. DoD per `CLAUDE.md`.

Open the wireframes and use the **role switcher** (Executive / PM / Dev·QA·Impl / Head of
PMs) — every screen below is drawn there, and the purple "design note" callouts state the
rule each screen enforces.

---

## 1. The core principle that reshapes everything

**QUBIT is a system of record, not a task tracker.** Tasks live in **YouTrack**; QUBIT
**mirrors them read-only**. Nobody authors or edits tasks in QUBIT — not devs, QA,
implementors, *or* PMs. The human-authored artefacts in QUBIT are:

- **Reports & weekly updates** (members author theirs; PMs author the project report).
- **Queries & concerns** (members → PM, per project).
- **Checkpoint & market-rollout state** (PM only).
- **Documents** (upload/approve by PM/lead; everyone downloads).

This supersedes `docs/18 §4` ("anyone on a project can create a task"). One consequence:
there is **one board per project**, not personal boards inside a project.

## 2. Roles × surfaces (the composition matrix)

Same shell, same routes; role changes what's visible and what's editable (DM1.10
composition, never forks). Nav is the six items from the notes: Dashboard · Portfolio ·
Programme · Projects · Reports · Teams & People.

| Surface | Executive | Head of PMs | Project Manager | Dev · QA · Implementor |
|---|---|---|---|---|
| Dashboard | AI brief + portfolio/programme/project cards + rollout heat map | Cross-PM roll-up **review + approve** queue; export | Check-in due · my projects (RAG) · action queue · team load | Nudge to send updates · my tasks · my queries |
| Portfolio | View cards (Approved/Exploring/Shelved) | View + **New portfolio** | View | hidden |
| Programme | View | View | View | hidden |
| Projects | List + filters → workspace (view-only) | List + export | List → workspace | List (their projects) → workspace |
| Project **Board** | — | view all | **view all** (read-only) | **view** (read-only; Mine/All toggle) |
| Project **Docs** | download | download | upload/approve + download | **download** |
| Project **Checkpoints & Rollout** | view | view | **edit** (states + market check-ins) | view |
| Project **Reports** | view PM summary + export PDF | view + export | **generate/edit/send to Head** | **author/edit own update + raise queries** |
| Reports index | per-project generate + PDF | **All-reports index + export** (portfolio/programme/resource) | per-project | own updates only |
| Teams & People | view | view + **export allocations** | manage project team | view |

MFA: **optional for Executive** (per notes); required for privileged roles (`docs/23`).

## 3. Project workspace (the redesign centre)

One workspace per project, tabs composed by role (wireframe: Projects → any row):

1. **Overview** — details (portfolio/programme/template/markets), derived progress + RAG,
   milestones, RAID, and the **latest PM summary report**. Exec sees exactly the notes'
   view: Details · Docs · Budget · Summary Report from PM.
2. **Board** — the single read-only project board (§4).
3. **Documents** — register with versions + approval; everyone downloads.
4. **Checkpoints & Rollout** — PM-editable checkpoint matrix (state per gate; **% derived**)
   + per-market track with weekly market check-in (narrative + RAG). Feeds the exec heat map.
5. **Reports** — in-workspace authoring (§5). Members' surface here = their weekly update +
   queries; PM's surface = generate/confirm/send the project report.
6. **Team** — project people + role hats + leave-aware allocation; PM manages.

## 4. The one project board

- **One board per project**, lanes **To do / Doing / Done** = views over YouTrack statuses
  (To do = Open; Doing = In Progress/In Review/In QA; Done = QA-passed).
- **Read-only**, badged "synced from YouTrack Nm ago". No create/edit/move that writes back
  (pull-only, confirmed). Moving work happens in YouTrack; QUBIT reflects it.
- **PM sees all assignees'** tasks (that's the point — triage/oversight). A member defaults
  to **Mine** with a toggle to **All**. Filters: assignee, type.
- The board is the raw signal that drafts the weekly updates (§5) — nobody "reports" tasks.

## 5. The reporting chain (member → PM → Head → Exec)

The spine, all authored **inside the workspace**:

1. **Member weekly update** (per project): **auto-drafted** from their board (Done this
   week, In progress, blockers). The member **edits/adds detail** and **raises
   queries/concerns** to the PM, then **submits**. Nudged if unsent by the deadline;
   escalated to PM if still unsent Monday 10:00. Members never touch tasks.
2. **PM project report** (per project): computed from acknowledged member updates + board +
   checkpoints → **computed RAG + narrative**. PM edits the one narrative line, optional
   RAG override (reason + 7-day expiry), and **sends to the Head of PMs**. Exportable PDF.
3. **Head of PMs roll-up**: submitted PM reports land in the Head's **review queue**; the
   Head reviews/annotates and **approves**; the approved roll-up flows to the executive.
   (This is the missing rung from `docs/19 §6` — build it as `PortfolioReport`.)
4. **Executive**: sees the AI brief, the portfolio/programme/project cards, the market
   rollout heat map, and per-project **summary reports** (view + export). Read-only.

Nudges (`docs/19` M3) drive step 1→2 punctuality; unconfirmed items surface honestly
("computed status shown") rather than silently.

## 6. Reports IA (confirmed)

Authoring lives in the workspaces (per project / programme / portfolio). The standalone
reports centre is **retired**; a thin **All-reports index** remains for the **Head of PMs**
to find and **export** across everything, plus **resource allocations** and portfolio/
programme packs (PDF). "Generate report" on a project row opens that project's workspace
Reports tab. All reports are editable; all export to PDF.

## 7. Onboarding a portfolio & projects (from the notes)

- **New portfolio** (Exec/Head): name, category (Approved/Exploring/Shelved), lens
  (Pipeline vs Rollout — sets default view + whether the market heat map shows), owner.
- **New project** (inside a portfolio): portfolio (required) + optional programme, a
  **checkpoint template** (Product build BRD→Go-Live, or Market rollout), the **markets**
  it targets, initial team. YouTrack connection is set later in workspace → Integrations.
- Every project belongs to a portfolio (seed "Unassigned" for backfill, per `docs/18 §0`).

## 8. Screen inventory → wireframe map → build

| # | Screen | In wireframe | New vs exists | Milestone (proposed) |
|---|---|---|---|---|
| 1 | Exec dashboard (AI brief, cards, heat map) | ✓ | exists, re-lay per notes | W1 |
| 2 | Portfolio cards + New portfolio | ✓ | exists + onboarding form | W1 |
| 3 | Portfolio detail (grouped, heat map) | ✓ | exists | W1 |
| 4 | Programme list/detail | ✓ | exists | W1 |
| 5 | Projects list + filters | ✓ | exists | W1 |
| 6 | Project workspace (6 tabs, role-composed) | ✓ | **rework** | W2 |
| 7 | One read-only project board | ✓ | **rework** (drop authoring) | W2 |
| 8 | Checkpoints & rollout (PM edit) | ✓ | extends `docs/18` | W2 |
| 9 | Member weekly update + queries + nudge | ✓ | extends member-reports | W3 |
| 10 | PM project report → Head | ✓ | extends check-ins | W3 |
| 11 | Head roll-up review/approve | ✓ (Head dashboard) | **new** `PortfolioReport` | W4 |
| 12 | Reports index + export (Head) | ✓ | **rework** (retire centre) | W4 |
| 13 | New portfolio / new project onboarding | ✓ | new forms | W1 |

Detailed, execution-ready specs per milestone (like `docs/21–23`) come next, after the
wireframes are signed off.

## 9. Open items to confirm on the wireframes

- **PM dashboard** composition (the one spot the notes left blank) — drawn as check-in
  status / my projects / action queue / team load. Keep or change?
- **Budget** on Exec workspace — notes list it, but money is Phase C (typed later). Show as
  a "typed in Phase C" placeholder until then?
- **Members' nav** — drawn slimmer (Dashboard · Projects · Reports), Portfolio/Programme/
  People hidden. Confirm members don't need portfolio-level browse.
