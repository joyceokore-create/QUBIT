# 09 — UI / Screen Specification

> Refreshed at M9 (docs/16 §12). This replaces the pre-revamp spec that described the v1
> exec-dashboard HTML (sidebar shell, /standalone, heatmap-first overview) — those
> surfaces were removed or reshaped across M0–M8. Behavioural detail lives in the specs
> this file points at; this is the map of what renders where, and why.

## App shell

- **Topbar:** tenant-branded logo + QUBIT mark, nav — Dashboard · My Board · Projects ·
  Risks · Time · Teams · People · Reports (+ Admin for admins), right side: notifications
  bell (SSE live), theme toggle, tenant chip, account menu, **Ask Q**.
- Theme is per tenant (Riverbank red; product-default green elsewhere, docs/08); every
  surface below renders
  under both.
- Machine routes (`/api/internal/*`, `/api/webhooks/*`) sit OUTSIDE the auth middleware;
  everything else redirects to `/login` without a session.

## Dashboard — persona presets (docs/17)

Route `/dashboard`. The persona resolver (declared ∪ derived groups, DM1.43: one declared
group) picks a preset; a switcher lets multi-group people change hats:

- **Executive** — greeting strip with escalations, portfolio health number + 8-week trend
  ("why?" drill-down), decision queue, portfolio-grouped sections (docs/18 §6): each
  portfolio a collapsible section, Rollout portfolios render the market heatmap, others
  the pipeline table.
- **PM** — their projects' pipeline rows, check-in queue, member-report acknowledgements,
  workload/leave exposure.
- **Developer / QA / Implementor** — focus card (ranked: overdue → due → in-review →
  freshest), their lane of work, QA gets the triage strip, Implementor gets next-go-live
  gates + rollout calendar (docs/17 §5–§7).

## My Board (docs/18 §4)

Route `/board`. Personal Trello-style lanes **To do · Doing · Done** as views over the
5-status taxonomy; "added by" attribution; Done feeds the Friday member report; QA owns
Completed for Feature/Bug (hand over with "In QA"). YouTrack-mirrored cards link out and
say "Move it in YouTrack."

## Projects

Route `/projects` — flat filterable list (ALL/status chips/MINE), **Export CSV**, New
project (permission-gated). Row → project workspace.

### Project workspace `/projects/[id]`

Header: portfolio · programme · code eyebrow, RAG pill, gate progress (checkpoint
template, docs/18 §2), members, Ask Q. Tabs:

- **Overview** — status updates, comments/decisions, project panel data.
- **Board** — kanban over the five statuses. **DM1.43 rules:** PMs see all four lenses
  (All/Dev/QA/Implementor) + Mine; a discipline member sees exactly their lane (server
  enforced, not just hidden); stakeholders read-only whole board. Cards carry: blocked
  flag, waiting-on chip (M7-A), commit count (M7-B), YouTrack key linking out (M7-C);
  drag/status limited to PM / own task / QA-in-scope. **Export CSV** respects the same
  visibility wall. YouTrack-connected projects hide task creation ("Issues are raised in
  YouTrack…").
- **Documents** — register with type/version/status (Draft→InReview→Approved via named
  approvers, docs/16 §6), requirements extraction review, traceability coverage.
- **Deadlines** — milestones; checkpoint editor with gate rules + audited override (M8-A).
- **Team** — members (role REQUIRED, picker shows where the role lands: "Developer → Dev
  board"), teams, allocation %.
- **Integrations** — provider cards; GitHub (webhook secret shown once + commit
  automation) and YouTrack (instance URL, project, token, field mapping, sync now) are
  live; others config-only.

## Risks `/risks`

Tabs Risks | Issues | Gap Report (unchanged from Phase A), plus **Export CSV**.
Materialise keeps the origin link.

## Time `/time`

Current user's weekly report, CSV export via `/api/time/report?format=csv`.

## People `/people`

Workload table — allocation %, **leave-aware effective %** (docs/16 §5), on-leave badges,
absence entry (manual + CSV import). **Export CSV** (allocations).

## Reports `/reports` (docs/18 §5)

- **R1** pipeline table (everyone), grouped by stage with gate ticks.
- **R2** project × market matrix, **R3** market focus/blockers (Rollout portfolios).
- Member weekly reports: Friday draft → edit (mandatory UX) → submit → PM acknowledges →
  rolls into the check-in. Share links (`/reports/s/[token]`) are read-only snapshots.

## Exports (M9)

One serializer (`src/lib/csv.ts`: BOM, CRLF, quoting, formula-injection guard) behind
`/api/export?kind=projects|tasks|risks|allocations` — every export reuses the exact
engine and permission scope of the screen it sits on. XLSX and server PDF are deferred
(DM1.45).

## Empty / loading / error states

Unchanged principles: skeletons while loading; friendly empties with a primary action;
inline error cards that never leak server detail; no-permission renders the Forbidden
page and the nav item is hidden.
