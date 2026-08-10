# 37 — Declutter & Status-Clarity Audit + Plan

**Date:** 2026-08-10 · **Method:** four parallel code audits over the live tree (nav/dashboards, project workspace, reporting chain, create/assign flows). Every finding below carries a file reference and was verified against the code, not the docs.

**The one-line diagnosis:** QUBIT's data layer is sound, but the same information is *rendered too many times in too many places with too many encodings*, while the answers users actually need — "what's this portfolio's health, what changed, what needs me?" — are buried or computed inconsistently. Decluttering and status clarity are the same fix: fewer surfaces, each one trustworthy.

---

## Part 1 — Trust bugs (fix first, regardless of anything else)

These are places where the UI is wrong or lying. They cost nothing to fix relative to what they cost in credibility.

| # | Finding | Impact | Effort |
|---|---|---|---|
| T1 | **Edit-project dialog silently discards whole saves.** Its priority list is `["Low","Medium","High","Critical"]` but the server enum is `["High","Med","Low","New","Strat","Paused"]`. Picking "Medium" or "Critical" 400s the entire payload — name, dates, everything — with a generic error. (`edit-project-dialog.tsx:26` vs `server/projects.ts:11`) | Data loss, user confusion | S |
| T2 | **Two fabricated gate strips.** The workspace hero's 8-cell "Discovery→Hypercare" rail and `/projects`' gate strip are both *invented from a percentage*, while the real checkpoint gates render elsewhere. Same project, two different gate visuals, one fake. (`project-workspace.tsx:38-53`, `lib/project-view.ts:32-37`) | Status trust | S |
| T3 | **Four different progress numbers for one project.** Hero % (org-status avg), Delivery tab % (real gates), Board % (tasks), pipeline table % (checkpoint-aware). Only `pipeline.ts` passes the checkpoint map into `avgProgress`. Fix: pass it everywhere (workspace, portfolio pages, snapshots, PM dashboard). | Status trust | S |
| T4 | **"Computed RAG" is not computed.** The check-in chip labelled COMPUTED is just a recolouring of the hand-typed `Project.status`. The provenance query already gathers gates, blockers, risks, member submissions — none feed it. `health.ts` itself says this swap was deferred. | Status trust | M |
| T5 | **Dashboard RAG ≠ report RAG.** A PM overrides a check-in to Red; the exec dashboard and Status tab still show Green because `pipeline.ts:221` reads `project.status`, not the week's `effectiveRag`. The parity test only covers surfaces that share the same input. | The core "track status properly" ask | M/L |
| T6 | **Nav dead ends for both Heads.** Teams/Audit/Access-requests are shown under `admin:access` but gated on `iam:manage`, which only SuperAdmin has → 3 of 6 admin destinations render Forbidden for Heads. Plus two nav items highlight at once (`nav-items.ts:41,75-77`). | Broken navigation | S |
| T7 | **"Send to the Head" does nothing.** The roll-up includes every confirmed check-in whether or not the PM pressed send (`portfolio-reports.ts:52-78`). The chain's middle rung is ceremonial. | Reporting chain integrity | S |
| T8 | **Portfolio arithmetic doesn't add up.** RAG counts skip Planning/Completed/Cancelled ("Total 12, accounted 5"); the dashboard, `/portfolios`, and `/portfolios/[id]` use three different queries with different status filters — different counts for the same portfolio. A portfolio of only-Planning projects reads GREEN while its health % reads 0. | Status trust | S/M |

## Part 2 — Declutter (remove, merge, collapse)

### 2a. Dead code — delete outright (~1,600 lines, zero user-visible risk)
- `components/dashboard/presets/registry.ts` (75 ln, zero importers) · `components/layout/nav-item.tsx` (77 ln, zero importers)
- `dashboard-v2.ts` dead interfaces + `getDashboardV2` (keep the one live 11-line helper); 3 unused `/api/dashboard/*` routes; `getDashboardSummary` + `parseBudget`
- `project-panel-content.tsx` + `project-tasks-section.tsx` (288 ln, never rendered); the dead `canPublish` prop chain (costs a DB query per page load)
- Retired task-authoring engine inside `project-tasks.ts` (~370 of 846 ln reachable only from tests)
- `lines` input on member reports (never sent by any client; open write path to overwrite machine facts — small security win)
- Duplicated `businessDaysBetween`; duplicated checkpoint state maps; three separate status→label maps; duplicate LiveClock/"LIVE" dot chrome

### 2b. Navigation: 12 items → 8, all of them working
| Change | Why |
|---|---|
| Merge **Programmes → Portfolios** (grouping toggle) | Every programme card already links to a portfolio page |
| Merge **People + Staffing** → one People page (Directory / Requests tabs) | Both are workload surfaces over the same query |
| Demote **Ideas** to a "+ New" action / under Projects | Members currently get 5 nav items vs the specced 4 |
| Demote **Risks** (fold into project Register — see 2d) | Hidden from the people who own risks; execs get it as chips |
| Fix **Teams/Admin** gating (T6) and single-active highlight | Dead ends today |
| Remove duplicate UserMenu + standalone Sign-out in the shell | Rendered twice |

### 2c. Dashboards: one page, one telling of each fact
- **Exec:** delete the duplicate `PortfolioCards` grid (same portfolios render twice on one page); keep Hero → Health trend → Decision queue → Sections → Changed.
- **Pipeline rows:** 9 encodings per row (5 chips + priority + gates + % + note) → health + the one worst thing; rest on hover.
- **Dev/QA/Impl:** drop `PortfolioSections` (docs/17 §4 explicitly says a dev dashboard with an org heatmap is noise); fold Implementor's `OpenGates` fragment into its hero; merge Pilots + GoLiveCalendar.
- **All personas:** strip LiveClock + pulsing LIVE dot; give **every** persona the "What changed" delta feed (today it's exec-only, so `lastDashboardSeenAt` never even advances for others); parallelize the two big dashboard queries (halves TTFB for 4 of 5 personas).

### 2d. Project workspace: 7 tabs → 5, Overview 11 cards → 4
- **Tabs:** `Overview · Board · Delivery · Reports · Setup` (Team + Integrations merge into Setup; Requirements merges into Documents; "Checkpoints & Rollout" pill renamed Delivery).
- **Overview:** Milestones · **Register** (see below) · latest confirmed check-in narrative (docs/25 asks for this; it's missing) · Details+Governance merged. Delete the duplicate description card. Hoist the 8 uncoordinated client fetches into the server component.
- **One RAID Register:** Risks, Issues, Blockers, Dependencies, Decisions, Lessons are 8 models across 9 server modules and 5 scattered surfaces — and a PM **cannot see or raise a risk for their own project** (risks live only on a global page hidden from members). One filtered table, one tab, no schema change: the row shapes are already parallel.
- **Status in the hero:** the field driving every dashboard (`Project.status`) is editable only via a 14-px corner pencil. Put status + the effective RAG chip inline in the hero; retire the FAB.

### 2e. Reports: 7 tabs → 5, zero duplication
- Delete **Status (R1)** and **Markets (R2)** tabs — both render the exact components the dashboard already shows. De-jargon the remaining labels (no user knows what "R1" means).
- Move roll-up build/approve **onto** the Roll-ups tab (today a Head must go to the exec dashboard persona to approve — and loses the control entirely in PM persona).
- Merge the two half-implemented member composers (one edits narrative+notes, the other notes+queries; neither does the whole job) into one.
- Surface the CSV exports that already exist (`/api/export?kind=projects|risks|allocations` works and nothing links to it); fix the "HTML / PDF" button vs "PDF lands with M9-B" contradiction.
- Fold `ProjectStatusUpdate` (a second, disconnected weekly RAG artefact) into the check-in — one weekly RAG statement per project, not two.

### 2f. Wizards: project 7 → 3 steps, portfolio 5 → 3
- **Project wizard:** delete the Docs step (its own copy says "entirely skippable"; the register handles it post-create) and the Integration step (same); merge Type-&-delivery + Markets into Basics. Result: Basics · Team · Review.
- **Portfolio wizard:** delete the Governance step (its body is literally "Nothing to configure yet."); fold Markets into Lens; default owner to self.
- **Team step traps:** applying the team template seeds 6 empty rows that then block the Next button ("every row needs a person") — let unfilled seats become **resource requests** on create (exactly what docs/30 promised). Fix the hardcoded 7-role list (server accepts 15).

## Part 3 — Track status properly (the additive changes)

1. **Make `/portfolios/[id]` the portfolio status page.** Today it's six raw numbers with no RAG, no delta, no check-in state, no owner. Reuse the dashboard section header (RAG + Δ + blockers + owner), add check-ins confirmed/total and a portfolio-scoped "what changed" list. This is the single page that answers "how is portfolio X?"
2. **One health engine, enforced.** Display RAG = the week's `effectiveRag` (override-aware) falling back to computed; route `/portfolios` + `/programmes`' hand-rolled dot logic through `health.ts`; make computed RAG actually derive from gates/blockers/risks (T4/T5); extend the parity test across dashboard = reports = roll-up CSV.
3. **Exec sees the denominator.** The approved roll-up narrative shows with no "N of M confirmed" and no as-of date — the numbers are already computed and thrown away.
4. **Nudges chase this week, not last.** The UI promises a Friday 17:00 deadline; both chasers only fire for the previous week. Add `checkin_unsent_to_head` + `member_report_unacknowledged` signals — the escalation/snooze/leave-rerouting machinery is all built already.
5. **Check-in state on the indexes.** `/projects` shows no freshness at all; add last-confirmed check-in + RAG chip per row.
6. **Idea handoff keeps sponsor + expected value.** Both are required at intake, then dropped at the project boundary (`businessOwner` sits empty).
7. **Leave entry surface.** Every capacity warning in QUBIT computes over the `Absence` table — which has a complete API and **no UI writes it**. Small panel on People.
8. **Shared assign panel + `lib/capacity.ts`.** Warning logic is duplicated (differently) in the wizard and the assign dialog; the bench is role-blind; bulk assign forces one role for everyone. One pure, tested function; one panel.

## Part 4 — Suggested implementation waves

| Wave | Contents | Size |
|---|---|---|
| **A. Trust & dead code** | T1–T3, T6–T8, all of 2a, RAG through health.ts on index pages | ~1–2 sessions, mostly deletes + small fixes; big test-suite safety net already exists (821 unit/RLS tests) |
| **B. Declutter the surfaces** | 2b nav, 2c dashboards, 2d workspace, 2e reports, 2f wizards | The visible payoff; each sub-item independently shippable |
| **C. Status engine** | T4, T5, Part 3 items 1–5 | The "one health engine" promise, enforced by tests |
| **D. Workflow completeness** | Part 3 items 6–8, portfolio edit surface, SharedReport listing | Rounds out create/assign |

Existing checklist items (docs/36) fold in cleanly: ⌘K search and the notifications centre slot after Wave B (they're additive nav affordances and land better on a decluttered shell); the deploy of DM1.67+M-C and `budget:read` are unaffected and still worth doing in order.

**Doc hygiene while we're at it:** mark docs/31 (P1-E) retired in the index (DECISIONS DM1.72 already retired it; docs/27 §5 still says "queued"), and record this plan as docs/37.
