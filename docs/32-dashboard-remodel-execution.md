# 32 — Dashboard & Navigation Remodel: Execution Spec

**Status:** Execution-ready · 2026-08-04
**Executes:** docs/25 §2 + W1 screens (dashboards per role, nav composition) and the
docs/24 notes, against the signed wireframes (`qubit-workflow-wireframes.html` role
switcher — every screen below is drawn there).
**Rule:** one milestone at a time, stop for review. DoD per CLAUDE.md + docs/27 §3.
**Out of scope:** the reporting chain itself (member update → PM report → Head roll-up →
exec) is P3 (docs/26 §11) — this spec builds the HOMES those flows land in, and stops
where a flow needs `PortfolioReport` (doesn't exist yet).

## 0. The §9 decisions (docs/25), now locked

1. **PM dashboard composition** — as drawn: check-in due banner · my projects (RAG + Δ)
   · action queue · team load. Confirmed 2026-08-04 ("go with best options").
2. **Budget on the exec workspace** — a labelled **"typed in Phase C"** placeholder.
   Honest emptiness over invented numbers; the column exists, nothing fakes it.
3. **Member nav is slim** — Dashboard · My Board · Projects · Reports. Members do not
   browse Portfolios/Programmes/People/Staffing/Teams/Risks/Time; their world is their
   work. (My Board stays — it is the docs/18 §4 daily surface, not portfolio browse.)

## 1. Current state (recon 2026-08-04)

| Blueprint concept | Exists today | Gap |
|---|---|---|
| Exec dashboard | `executive.tsx`: brief (priorities), health trend, decision queue, portfolio sections, rollout heat maps, delta | sections not grouped by **category**; no top **cards row** linking to Portfolios/Programmes/Projects (notes (ii)) |
| Head of PMs | `HeadOfProjects` derives the **executive** group → plain exec preset | no **check-in review queue**, no export shortcuts (docs/25 matrix row 1) |
| PM home | `pm.tsx`: check-in hero, portfolio sections, "stuck on me" | not the drawn shape — no my-projects table with Δ/milestone/blockers, no **team load** widget |
| Member homes | dev/qa/impl presets (M1b/M1c): queue, momentum, checklist | fine — only the nav slims (§0.3); queries-to-PM arrive with P3 |
| Programme page | none (programmes only visible inside a portfolio) | nav says Programme → needs a light **index** |
| Nav | 11 items, only admin-gated filtering | member slimming; Programmes item |
| Δ (WoW deltas) | `ProjectSnapshot`/`PortfolioSnapshot` + delta feed exist | reuse — no new schema |

**No schema changes anywhere in this spec.** Every milestone is server-read + UI.

## 2. Milestones

### M-W1a — Programmes index + role-aware nav

- `/programmes` (new page): category-grouped cards like the portfolio index (name,
  parent portfolio, project count, RAG dot, avg progress), "New programme" button for
  `programme:create` holders opening the existing dialog (parent portfolio picked in the
  dialog — add the select when opened from here). Card → parent portfolio detail
  (programmes have no own detail page yet; deep-linking `?programme=` filter is enough).
- Nav: add **Programmes** after Portfolios. Add `NavItem.memberHidden` and filter the
  member set per §0.3 — driven by the viewer's PERSONA GROUPS (a Member whose only group
  is dev/qa/implementor), never by pathname sniffing. Executives/Heads/PMs unchanged.
- Server: `getProgrammeCards(ctx)` in `src/server/dashboard.ts` beside
  `getPortfolioCards` (same RAG/avg math over each programme's projects).
- Tests: programme-cards math + RLS; nav filter unit (member vs pm vs exec sets).

### M-W1b — Exec re-lay + the Head's queue

- **Top cards row** (notes (ii)): three link-through cards — Portfolios (n, worst RAG),
  Programmes (n), Projects (n active) — each linking to its index page. Sits between the
  brief and the sections; no KPI-strip resurrection (DM1.29 stays dead).
- **Category-grouped sections**: portfolio sections group under Approved → Exploring →
  Shelved headers (worst health first WITHIN a group; Unassigned last in Approved).
  Pure re-order of `PortfolioSections` input — the component is untouched.
- **Budget placeholder** (§0.2) on the workspace Overview details card (all roles see
  the same truth: `Budget: typed in Phase C` when null).
- **Head-only queue panel** (compose, never fork — DM1.10): when the viewer holds
  `HeadOfProjects`, the exec preset inserts a **"PM check-ins this week"** panel above
  the decision queue: per active project — PM, computed RAG, confirmed/unconfirmed
  (existing `CheckIn` data), link into the workspace. Plus the two export buttons that
  already exist as CSV routes (projects, allocations). The APPROVE action ships with
  `PortfolioReport` in P3 — the panel says so instead of faking it.
- Tests: grouping order (category then health), head-panel visibility (HeadOfProjects
  yes, plain Executive no), budget placeholder rendering.

### M-W1c — PM home re-lay (the drawn shape)

1. **Check-in banner** (kept from today's hero, full-width).
2. **My projects table**: RAG dot · progress bar · **Δ WoW** (from `ProjectSnapshot`,
   same math as the exec sparklines) · next milestone (first future `ProjectMilestone`)
   · open blockers count · Open →. "My" = lead or PM-role member; the scope toggle
   (mine/all, DM1.20) stays.
3. **Action queue** (two cards): approvals & handoffs — member reports awaiting my ack
   (M2-B), aged blockers >3d, pending join requests; each row deep-links.
4. **Team load**: leave-aware utilisation across my projects (`listWorkload` filtered to
   my project members): avg bar + "N people >90% next week · M on leave" + link to
   /staffing. This is the daily surface for docs/26 §4.3 capacity awareness.
- The portfolio sections stay BELOW the fold of these four (the PM's landing question is
  "what needs me", not "browse the estate").
- Tests: my-projects Δ/milestone/blockers assembly; action-queue contents; team-load
  math (leave-aware, scoped to my projects only).

### Sequencing & review gates

M-W1a → M-W1b → M-W1c, stop-for-review each. All three leave every persona working;
nothing waits on P3.

## 3. Wireframe deltas locked with this spec

Annotations updated in `qubit-workflow-wireframes.html`: PM dashboard note reads
"confirmed 2026-08-04"; exec note adds category grouping of cards/sections; Head note
says approve arrives with P3 (the queue is review-only v1); member-nav note confirmed.

## 4. Definition of done (per milestone, beyond CLAUDE.md)

Screen matches its wireframe or the deviation is a DECISIONS line; RAG shown anywhere
equals `health.ts` output (parity is the exec view's only currency); no new schema; no
mutation added without an audit row (M-W1 is read-only — any mutation here is a smell);
browser-verified per persona before commit.
