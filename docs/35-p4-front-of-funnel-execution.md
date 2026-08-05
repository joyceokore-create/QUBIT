# 35 — P4 Execution Spec: Front of funnel & polish (idea intake, ⌘K, notifications, states)

**Status:** Execution-ready · 2026-08-05
**Executes:** docs/26 §11 P4 + docs/26 §5.4 (idea intake → project) against the wizards
wireframe (`docs/wireframes/qubit-wizards-wireframes.html`, the "Idea intake" pane).
**Rule:** one milestone at a time, stop for review. DoD per CLAUDE.md + docs/27 §3.
**Out of scope:** server-rendered PDF (M9-B); business-case scoring and benefits
realisation (docs/26 §2 marks both parked until money is typed — P5); Q auto-summarising
an idea (see §3 — the hook exists, the AI call does not ship here).

## 0. Current state (recon 2026-08-05)

| P4 piece | Exists today | Gap |
|---|---|---|
| Idea intake + triage | **nothing.** `AccessRequest` is pre-tenant lead capture (no `tenant_id`), unrelated | the whole rung: model, form, triage board, accept→project |
| ⌘K search | **nothing** — no `cmdk` dependency, no `/api/search` | the whole thing |
| Live notifications | **most of it**: `Notification` model, outbox fan-out, SSE `/api/events` + `notification.created`, bell with unread badge + mark-all + per-item read, `/api/me/notification-preferences`, Friday digest job | no **notifications page** (bell dropdown only, capped list); no filter/archive; no "notify me about" surface beyond email prefs |
| Empty / first-run states | good on P1–P3 surfaces (wizards, boards, reports all state honestly) | never swept as a whole; pre-P1 surfaces unaudited |
| Mobile + a11y | Tailwind responsive throughout; Radix/Base UI primitives give keyboard+ARIA on dialogs, menus, tabs | never audited; no axe run; touch targets and table overflow unverified |

The lifecycle spine (docs/26 §2) says **Intake** is the one stage with no surface at all.
That makes M-P4a the phase's centre of gravity; everything after it is polish on a spine
that is otherwise complete.

## 1. Milestones

### M-P4a — Idea intake & the triage board (docs/26 §5.4)

The front of the funnel: an idea enters, the Head/PMO triages it, and an accepted idea
becomes a project in **Exploring** with nothing retyped.

- **Model `Idea`**: tenantId, title, sponsor, problem, expectedValue, submittedById,
  status `New | Reviewing | Accepted | Parked | Merged`, parkReason, suggestedPortfolioId
  (nullable — the intake form's own suggestion, not an AI guess), acceptedProjectId /
  mergedIntoProjectId (nullable FKs), triagedById/At. Inline RLS in the migration +
  `prisma/rls.sql` resync (78 tables).
- **Submit** — any authenticated user (`idea:create`, granted to every role: the point of
  intake is that a good idea can come from anywhere). Zod-validated, audited, notifies the
  Head of PMs through the outbox. No public/pre-auth route in this milestone — the
  wireframe's "public-ish" stays inside the tenant until we have a reason to widen it
  (noted as a deliberate narrowing).
- **Triage board** (`/ideas`, `idea:triage` → HeadOfProjects + PlatformSuperAdmin, execs
  read): two lanes as drawn, New and Reviewing, then the three actions:
  - **Accept → new project**: stamps the idea Accepted and routes to the project wizard
    **pre-filled** (title, sponsor as the description seed, suggested portfolio). The
    wizard gains an optional `fromIdea` prefill and, on create, links the idea to the new
    project in the same transaction — no half-linked idea if the create fails.
  - **Park (with reason)**: reason required (≥5 chars, like the roll-up narrative);
    audited; the submitter is notified. A parked idea is never deleted.
  - **Merge into existing**: pick a project; the idea records `mergedIntoProjectId` and
    shows on that project's Overview as provenance.
- **Everyone sees their own**: a submitter reads their ideas and outcomes (scoped like
  member reports — own rows only, RLS plus userId).
- Tests: submit → notify Head; park requires a reason; accept links idea↔project in ONE
  transaction (and rolls both back on failure); a non-head cannot triage; a submitter sees
  only their own; tenant B blind.

### M-P4b — ⌘K command search

One keyboard surface over what the viewer may already see. Nothing new becomes visible:
the search runs **inside** RLS and inside the same scoping rules each list uses.

- **`/api/search?q=`** — a single Zod-validated route returning grouped hits: projects
  (code + name), portfolios, programmes, people, ideas, plus **actions** ("New project",
  "New portfolio", "My board") filtered by the viewer's permissions. Case-insensitive
  `contains` on indexed columns, capped per group (5) and overall (20) — no unbounded
  scans, no cross-entity SQL cleverness.
- **Palette** (`cmdk` — a new dependency, noted in docs/03 with its reason: it is the
  primitive shadcn's own Command wraps, ~10kB, and hand-rolling focus/type-ahead is worse):
  ⌘K / Ctrl-K anywhere, Esc closes, ↑↓ moves, Enter navigates. Debounced fetch, honest
  empty ("nothing matches — try a code like RBS-01"), never a spinner that lies.
- Tests: pure result-ranking/grouping unit tests; route returns only in-tenant rows;
  a member's search cannot surface a project they can't open (scoping parity with
  `/projects`); action list respects permissions.

### M-P4c — The notifications centre + first-run and a11y sweep

- **`/notifications`**: the full history the bell can only sample — filter by read/unread,
  grouped by day, each row deep-linking to its subject. Mark-all and per-item read reuse
  the existing routes; the page adds paging (`take`/`cursor`) rather than a new engine.
  The bell gains "See all →".
- **First-run states**: sweep every top-level surface for the honest-empty rule (say what
  is missing and the one action that fixes it; never a fake number, never "coming soon").
  The pre-P1 surfaces (`/risks`, `/time`, `/people`, `/subsidiaries`, `/my-tasks`) are the
  ones to fix; P1–P3 surfaces already comply and are only re-checked.
- **a11y + mobile pass**: keyboard reachability on the new P1–P4 surfaces (wizards, board,
  reports index, triage, palette), visible focus rings, labelled controls, `aria-current`
  on tab strips (already the pattern), wide tables scroll inside their own container, and
  touch targets ≥40px on the primary flows. Findings that need real rework get logged in
  DECISIONS rather than silently half-fixed.
- Tests: notifications paging + read scoping (a user can never read another's row —
  pinned both ways); a11y assertions in RTL on the palette and triage board (roles,
  labels, focus order).

## 2. Sequencing note

M-P4a is the only milestone with a migration; M-P4b adds the one dependency; M-P4c is
sweep work. If time is short, M-P4a alone still leaves the spine complete for the first
time (intake → exploring → delivery → rollout → report), which is the phase's real
promise.

## 3. Deliberate exclusions (say them out loud)

- **Q pre-summarising an idea** (docs/26 §5.4) is NOT in M-P4a. The triage board leaves the
  hook — a summary field the engine can fill later — but shipping an AI summary needs the
  scope+timestamp honesty contract (docs/26 §10) and belongs with a Q milestone, not here.
  An empty summary field says "not summarised", never a fabricated line.
- **Business-case scoring / prioritisation** stays parked per docs/26 §2 — it needs typed
  money, which is P5's Phase-C dependency.
- **Public idea submission** (unauthenticated) is deliberately not built; see M-P4a.

## 4. Definition of done (per milestone)

Wireframe-matched or DECISIONS-noted; RLS verified both directions; every mutation
audited; new tables carry inline RLS **and** land in `prisma/rls.sql`; `pnpm lint`,
`pnpm typecheck`, `pnpm test` green; browser-verified per role; deployed and verified on
the box (migration row count under each tenant's RLS context — the DM1.18/DM1.50 trap).
