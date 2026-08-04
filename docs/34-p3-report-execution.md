# 34 — P3 Execution Spec: Report (in-workspace authoring, the Head roll-up, the thin index)

**Status:** Execution-ready · 2026-08-05
**Executes:** docs/26 §7 P3 + docs/25 §3/§5/§6 (W3/W4 screens) against the workflow
wireframes (workspace Reports tab, member update, PM report, Head roll-up queue).
**Rule:** one milestone at a time, stop for review. DoD per CLAUDE.md + docs/27 §3.
**Out of scope:** server-rendered PDF (stays deferred with M9-B — exports remain
CSV/markdown/print until then, stated on the surfaces, never faked); idea intake (P4).

## 0. Current state (recon 2026-08-05)

| Chain rung | Exists | Gap |
|---|---|---|
| Member weekly update | `MemberReport` (Draft→Submitted→Acknowledged, auto-drafted, composer on /reports) | authored on the REPORTS page, not in the workspace; no **queries to PM** field |
| PM project report | `CheckIn` (computed → confirm, narrative, RAG override) on the workspace Overview | no **send to Head** step; past reports not listed per project |
| Head roll-up | M-W1b queue (read-only) + "approve arrives with P3" note | **`PortfolioReport` missing** — the whole rung |
| Exec view | reports page R1–R3 + exec dashboard | fine — consumes the roll-up once it exists |
| Workspace shape | Overview·Board·Documents·Delivery·Deadlines·Team·Integrations | wireframe wants **Reports** in the workspace; Deadlines' milestones belong ON Overview (docs/25 §3.1) |

## 1. Milestones

### M-P3a — The workspace Reports tab + the Overview new look

- **Reports tab** (role-composed, docs/25 §3.5): a MEMBER sees their weekly update for
  THIS project — the auto-drafted section, their notes, and a new **"Queries & concerns
  to the PM"** field (rides in the `MemberReport.draft` JSON per project section — no
  migration), submit button, past updates list. A PM sees the week's check-in (confirm +
  narrative + override — the existing card relocated from Overview), a **"Confirm & send
  to the Head of PMs"** action (`CheckIn.submittedToHeadAt`, one nullable column), and
  this project's past reports. Execs/stakeholders see the sent reports read-only.
- **Overview, the wireframe shape** (docs/25 §3.1): details · latest PM summary (latest
  confirmed check-in narrative + RAG) · milestones (folded IN from the Deadlines tab,
  which retires) · RAID. Tab set becomes Overview · Board · Documents · Checkpoints &
  Rollout · **Reports** · Team · Integrations (Integrations stays — connect flows live
  there; a deliberate +1 on the wireframe's six, noted).
- PM ack queue shows the member's queries (they ride the draft JSON it already reads).
- Tests: query field round-trip; submit-to-Head stamps + re-confirm resets; tab
  composition per role.

### M-P3b — `PortfolioReport`: the Head's roll-up rung

- Model: tenantId, isoWeek (unique per tenant+week), status `Draft|Approved`, narrative,
  payload Json (the per-project rows frozen at build time: code, PM, RAG, check-in state,
  submitted?), approvedById/At. RLS inline; rls.sql resynced.
- Engine: `buildRollup(ctx, isoWeek)` (Head-only) — assembles from live check-ins,
  idempotent upsert of the Draft; `approveRollup(ctx, isoWeek, narrative?)` — freezes
  payload, stamps approval, audits, events + notifies executives; `getRollup`.
- The M-W1b Head queue's "Awaiting my approval" KPI becomes real; the queue gains
  Review → build/annotate/approve. The exec dashboard hero shows "Week N roll-up" with
  the Head's narrative when approved (grounded, never invented).
- Tests: build idempotency, approve freeze (later check-in changes don't mutate the
  approved payload), Head-only gates, exec surfacing, RLS.

### M-P3c — The thin reports index (docs/25 §6)

- /reports re-lays per role: members → own updates only; PMs → their projects' reports
  (deep links into workspace Reports tabs); the Head → the all-reports index + the
  roll-up archive + exports (CSV now, PDF marked deferred); execs → summaries + exports.
  "Generate report" affordances route INTO workspaces — the standalone centre retires.
- Tests: role composition of the index; roll-up archive listing.

## 2. Definition of done (per milestone)

Wireframe-matched or DECISIONS-noted; the chain never lies (unconfirmed = "computed
status shown", never silently upgraded); RAG parity via the one health engine; every
mutation audited; browser-verified per role; deploy verified on the box.
