# 09 — UI / Screen Specification

Screens and interactions are taken directly from `qubit_exec_dashboard.html`. Reproduce the
behaviour; back it with live, tenant-scoped API data instead of the in-file constants.

## App shell

- **Topbar:** logo (4-square mark + "QUBIT"), nav tabs (Dashboard, Executive View, My Tasks,
  Reports), right side: **TenantChip** (e.g. "KCB Group — All Subsidiaries ▾") + user avatar.
- **Sidebar groups:** Navigation (Group Overview), Portfolios (list with item counts),
  Standalone (Independent Items), Subsidiaries (one per org unit with flag), footer (Risks &
  Issues with a red count badge).
- Active nav item uses `--brand-light` bg + `--brand` text. Items hidden if no permission.

## Screen 1 — Group Overview (default)

Route `/(app)/dashboard`. Eyebrow "Executive Overview", title "<Tenant> — Project & Programme
Portfolio", sub-line summarising counts + quarter. Actions: Export PPT (stub), Refresh.

Blocks, in order:
1. **KPI strip (6):** Total Items, Portfolios, On Track (green), At Risk (amber), Overdue (red),
   Budget Used (% + amount). Each has a thin progress bar. Data: `/api/dashboard/summary`.
2. **Portfolio × Subsidiary Health Map:** rows = portfolios, columns = subsidiaries. Each cell
   shows avg % , item count, and status word; colour = worst status among items (Overdue >
   At Risk > On Track); empty pairing = dashed `—`. Click a **cell** → subsidiary-filtered
   portfolio view; click a **portfolio name** → portfolio detail. Data: `/api/dashboard/heatmap`.
3. **Portfolios grid (2-col):** PortfolioCard each — RAG counts, avg progress bar, subsidiary
   pips. Click → portfolio detail. Data: `/api/portfolios`.
4. **Standalone grid (3-col):** independent projects/programmes. Click → slide panel.
   Data: `/api/standalone`.
5. **Bottom split:** left "Escalations & Risks" feed (dot colour by severity, text, meta:
   type · id · age) from `/api/dashboard/escalations`; right "Upcoming Milestones" feed from
   `/api/dashboard/milestones/upcoming`.

## Screen 2 — Portfolio Detail

Route `/(app)/portfolios/[id]`. Breadcrumb: Group Overview › <Portfolio>. Header card: name,
description, and stat row (Total Items, On Track, At Risk, Overdue, Avg Progress, Budget).

Body:
- **Programmes** section: one expandable ProgrammeCard per programme — header (name, id,
  budget, project count, status pill, avg progress) opens the **programme panel**; body lists
  its projects as rows (name, id, priority, subsidiary pips, progress, status pill, due). Row
  click → **project panel**.
- **Standalone Projects in this Portfolio** (projects with no programme): StandaloneCard grid.

Optional `?sub=` filter highlights a subsidiary's pips (set when arriving from a heatmap cell).

## Screen 3 — Standalone Items

Route `/(app)/standalone`. Breadcrumb: Group Overview › Standalone Items. StandaloneCard grid of
all items with no portfolio.

## Screen 4 — Subsidiary View

Route `/(app)/subsidiaries/[orgUnitId]`. Breadcrumb: Group Overview › <Subsidiary>. Eyebrow with
flag + name. KPI strip (4): Total Items, On Track, At Risk, Overdue (scoped to that subsidiary).
ProjectTable with filter chips (All / On Track / At Risk / Overdue) + search. Rows show the
project's status **for that subsidiary** (from `project_org_status`), subsidiary pips (current
highlighted), progress, portfolio name (or "Standalone"), due (red if overdue). Row → project
panel. Data: `/api/subsidiaries/:orgUnitId/projects`.

## Slide-in panels (right sheet, 660px)

Opened by clicking any project/programme; dimmed overlay; close via ✕, overlay click, or Esc.

**Project panel:** eyebrow (id · type · priority), title, sub-line (portfolio · programme · due
· budget). Body: 4 stat tiles (Overall Progress, Status, #Subsidiaries, Budget); **Progress by
Subsidiary** list (per-sub status pill, %, bar, milestone chips); **Milestone Matrix** table
(subsidiary rows × milestone columns; cell = state block or `—`). Data: `/api/projects/:id`.

**Programme panel:** stat tiles (Avg Progress, Status, #Projects, Budget); RAG summary tiles;
"Projects in this Programme" list (row click drills into a project panel). Data:
`/api/programmes/:id`.

## RAID screen (Phase A)

Route `/(app)/risks`. Tabs: Risks | Issues | Gap Report.
- **Risks:** table (title, project, category, prob×impact heat, owner, status). Create/edit via
  dialog. Action "Materialise" converts to an issue (keeps origin link).
- **Issues:** table (title, severity, owner, status, origin risk link).
- **Gap Report:** occurred issues vs originally owned risks — highlights issues with no prior
  owned/mitigated risk (supports PIR). Data: `/api/raid/gap-report`.

## Derived values (keep consistent with the reference)

- Project overall progress = average of its subsidiaries' `progress`.
- Portfolio avg progress = average of its projects' overall progress.
- Heatmap cell % = average progress of that portfolio's items present in that subsidiary.
- Cell/roll-up status = worst status present (Overdue > At Risk > On Track).

## Empty / loading / error states

- Loading: skeletons for KPI cards, heatmap rows, tables.
- Empty: friendly message + primary action (e.g. "No portfolios yet — create one").
- Error: inline error card; never leak server/stack details to the client.
- No-permission: the nav item is hidden and the route returns 403 handled with a friendly page.
