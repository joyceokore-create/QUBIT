# 16 — QUBIT Revamp Plan v2: Product Rethink & Build Plan

**Status:** Proposed · 2026-07-28 (v2 — supersedes v1 of same date)
**Owner:** Joyce Okore
**Builds on:** `10-build-plan.md`, `15-phase6-delivery-workflow-plan.md`, `14-stakeholder-feedback-backlog.md`
**Execution rule:** one milestone at a time, stop for review. DoD per `CLAUDE.md`.

v1 of this plan was an engineering plan: wire up what exists. v2 is a product plan: decide
what QUBIT *is*, cut what dilutes it, and build the loops that make people live in it.
The engineering backbone from v1 (jobs, events, snapshots, one health engine) survives —
it was right. What changes is everything around it.

---

## 1. What QUBIT is (and is not)

QUBIT is **the system of record for delivery truth at Riverbank**: what's being built, by
whom, is it healthy, and what needs a decision. It is opinionated like Linear, not
infinitely configurable like ClickUp. Every feature must serve one of three loops:

1. **The daily loop** — a member opens QUBIT and knows exactly what to do next.
2. **The weekly loop** — a lead confirms a system-drafted status in 2 minutes; leads and
   execs get pushed truth every Friday without asking anyone.
3. **The lifecycle loop** — a project moves through governed stages (BRD in → benefits
   out) with gates, documents, and traceability.

QUBIT is **not**: a chat app (Teams owns that), a document editor (it's a document
*register*), an HR/finance system of record (it *reads* the ERP), or a ClickUp clone
(flexibility is ClickUp's product; **opinion is ours**).

What we steal from the market: Linear's speed and opinionation (few statuses, keyboard
first, triage inbox); Asana's status-update ritual and portfolio roll-up; Monday's
at-a-glance dashboards; ClickUp's contextual comments — and a warning from ClickUp's
bloat: every "everything app" feature we copied into the `/s` surface went unused.

---

## 2. The kill list (what goes)

Cutting is the first milestone, not the last. Everything here is drag: maintenance cost,
security surface, and user distrust.

| Cut | Why | When |
|---|---|---|
| **ClickUp shadow stack** (~25 models, ~90 `/api/v1` routes, 14 components, `/s` surface) | Two task systems is two truths. Sunk cost is not a reason to keep it. Concepts worth having (comments, dependencies, time) get lean rebuilds on `ProjectTask`. Code and routes go now; tables drop in the final milestone after data checks. | M0 |
| **Fake AI** — "AI executive brief", "AI insights", "Recommendations" panels (deterministic string generators labelled AI) | Trust is the exec dashboard's only currency. Either it's Q (real, gated, logged) or it's a computed summary — label it as such or delete it. | M0 |
| **"Soon" placeholders** — Confidence, AI-predict columns, Dependencies `SoonCard` | A dashboard that says "soon" teaches users to ignore it. Features return when real. | M0 |
| **Marketing copy for unbuilt loops** — board copy promising `RBS-01-5 #done` commit automation, "deadline nudges" | Never promise in copy what the system can't do. Returns behind flags when shipped. | M0 |
| **pg-boss** (zero callers), orphaned components (`health-heatmap.tsx` consumer-less, old `sidebar.tsx`, `kpi-strip.tsx`, `portfolio-card.tsx`) | Dead code hides live bugs. | M0 |
| **60s polling notification bell** | SSE infra already exists (`src/server/realtime.ts`); polling makes the app feel dead. | M0 |
| **Dual milestone models** (`Milestone` vs `ProjectMilestone`) | One concept, one model. `ProjectMilestone` wins; legacy KCB path migrates. | M1 |
| **Free-text budget strings** on the dashboard | `"KES 2.8B"` parsed by regex is not a KPI. Money leaves the dashboard until typed (Phase C CBA work). | M1 |

---

## 3. The dashboard: yes, it's overcrowded

Today's dashboard has **11+ zones** (brief, priorities, health ring, notifications, 7 KPI
tiles, full projects table, insights, recommendations, milestones, risks, capacity).
That's a report pretending to be a dashboard. Nobody scans 11 panels; they learn to skip
all of them.

**Redesign principle: a dashboard answers three questions in ten seconds.**

1. **What needs me today?** → Briefing hero + "Needs attention" strip (max 5 items,
   ranked by the existing relevance engine — the best code in the repo finally gets the
   headline slot).
2. **What changed since I last looked?** → A delta feed ("2 blockers opened on Mobile
   Banking, QA cleared 8 tasks, Sarah's project slipped a milestone") computed from
   events + snapshots since the user's last visit.
3. **What's at risk?** → **Three** KPIs with trend sparklines (On-track %, Overdue tasks,
   Capacity pressure) + the portfolio heatmap (already built, finally rendered) as the
   drill-down entry point.

Everything else **moves to where it belongs**: projects table → `/projects`; risks →
`/risks` (restored to nav); capacity detail → `/people`; milestones → project workspaces.
Role composition, not role forks (DM1.10 stands): executives see Health first and Today
collapsed; members see Today first. Widget rule going forward: **every panel must earn
its place — if click-through is ~zero after 30 days, it goes.**

---

## 4. Chat: no — conversation, yes

**Position: do not build chat.** Riverbank runs on Microsoft — Teams already owns
synchronous chat, and a PMS chat tab becomes a ghost town that splits conversation
history in two. Building it means competing with Teams with zero users.

What a PMS needs is **conversation attached to work**, which chat apps are bad at:

- **Threaded comments with @mentions** on tasks, projects, risks, and documents
  (`Comment` polymorphic on entity). Mentions → notification + email. This is the single
  biggest daily-engagement gap in the product today (comments currently exist only on the
  dead ClickUp surface).
- **Promote comment → Decision.** One click turns a comment thread's outcome into a
  `Decision` log entry (what, why, who, when) on the project. This also fills the missing
  "D" in our RAID — stakeholders asked for lessons/decisions capture, and decisions die
  in Teams threads today.
- **Escape hatch, not competitor:** a "Discuss in Teams" deep-link on any entity (later,
  via Graph API), so long-form debate happens in Teams but the *conclusion* comes home to
  QUBIT.

---

## 5. Leave & the ERP: the system should know who's away

The ask: when a project member is on leave, QUBIT knows and reacts. Design it as an
**absence-aware resource layer** with a source-agnostic adapter, so we never block on ERP
integration timelines:

- **Model:** `Absence` (userId, type `Leave|Sick|Training|Other`, startDate, endDate,
  source `erp|import|manual`, externalRef). Tenant-scoped, RLS, audited.
- **Adapter modes** (`src/server/connectors/hr-absence.ts`), in order of availability:
  1. **Manual/admin entry** — ships day one, zero dependencies.
  2. **File bridge** — CSV/ICS import from the ERP's leave export (works with any ERP
     without a single API call).
  3. **API pull** — a scheduled read-only sync job once the ERP endpoint (Oracle Fusion /
     HRMS per `14-stakeholder-feedback-backlog.md`) is provisioned. Read-only: the ERP
     stays the system of record; QUBIT never writes leave.
- **The payoff — absence propagates everywhere:**
  - Capacity math subtracts leave days from the allocation window (no more "on leave but
    100% allocated").
  - Board and task cards show an **"On leave until 12 Aug"** badge on assignees.
  - Assigning a task due inside someone's leave window triggers a warning + suggested
    alternates (same project role, lowest utilization).
  - The **nudger suppresses nudges to absent people** and reroutes escalations to the PM
    — nudging someone on annual leave is how you teach a team to ignore nudges.
  - The Friday lead report flags next week's exposure: *"3 members on leave next week;
    Mobile Banking loses 40% of QA capacity."*

---

## 6. Project lifecycle: from status field to stage machine

Projects today have a status; they need a **governed lifecycle**. This is what makes QUBIT
a PMO tool rather than a task tracker, and it maps directly to the PRD's three governing
use cases (risk during development, pilot go/no-go, post-deployment PIR).

**Stages (updated 2026-07-28):** the business pipeline is `Exploring → Evaluating →
Approved (→ Paused)` with per-template delivery checkpoints (BRD → Proto → MVP1 → SIT →
UAT → Go-Live, etc.) — see `18-delivery-tracking-boards-reporting-spec.md` §1–2, which
supersedes the stage names below. Gate checklists still apply at checkpoint boundaries
(soft-block with override + mandatory reason, audited; hard rules can come later):

| Gate into | Requires |
|---|---|
| Planning | Approved BRD in the document register; lead + core team allocated |
| Execution | Approved plan (published tasks + milestones); URS/requirements captured |
| Pilot/UAT | Requirement coverage ≥ threshold; open Critical bugs = 0 |
| Closure | PIR done; **lessons learned captured** (new `LessonLearned` entity — direct stakeholder ask); handover doc approved |
| Benefits | CBA baseline exists (Phase C dependency — parked until money is typed) |

**Documents (BRD, URS & co.) become a register, not a folder:**

- `ProjectDocument` grows: type (`BRD|URS|SRS|Design|TestPlan|Signoff|Other`),
  **versioning** (v1→v2 supersede links), review workflow
  (`Draft → InReview → Approved` with named approvers, every transition audited).
- **AI ingest with human gate** (the P0 from `MVP1-IMPROVEMENT-NOTES.md`): upload a
  BRD/URS → Q extracts candidate requirements, milestones, tasks → a review screen
  ("Q found this in your BRD") → only approved items become real. Never auto-apply.
- Extracted **`Requirement`s keep source anchors** (document + section), enabling
  traceability: requirement → tasks → QA evidence → coverage %, and reports that say
  *"URS §3.2 has no covering task."* This absorbs Phase 6.5.

---

## 7. Status updates: computed, narrated, confirmed — never typed from scratch

The most important workflow rethink. Status reporting fails in every PMO the same way:
leads retype what the system already knows, late and rosy. Invert it:

- **Task level (exists/extends):** members move cards; commits move tasks to `InReview`
  (M7); QA owns `Completed`; blockers are flags with reasons. Task activity is the raw
  signal — nobody "reports" it.
- **Project level — the Friday check-in:** every Friday the system **drafts the status
  update** from the week's events: completed/slipped, blockers opened/resolved, absences
  ahead, milestone movement, computed RAG (one health engine, PRD formula — dashboard, Q,
  and reports must agree). The lead reviews, edits the narrative line, and **confirms in
  under 2 minutes**. Optional RAG override requires a reason, shows as a "lead override"
  chip, and expires after 7 days so overrides can't rot.
- **The confirmed check-in *is* the weekly report.** It flows into the Friday
  `SharedReport` to leads and the exec digest. Unconfirmed by Monday 10:00 → nudge; the
  digest marks the project *"unconfirmed — computed status shown"*. Honest by default.

This kills the weekly status meeting's first 30 minutes and is the single most engaging
ritual we can ship.

---

## 8. Email & notifications: digest-first, Microsoft-native

Riverbank is an M365 shop (Azure AD SSO planned, Outlook workflows), so email transport is
**Microsoft Graph sendMail** (or M365 SMTP) behind a thin `Mailer` interface —
provider-swappable, `FEATURE_EMAIL` flagged, per-tenant branded templates.

**Anti-spam policy is the design, not an afterthought:**

- **Immediate email:** @mentions, task assigned to you, escalations that name you,
  access approvals.
- **Daily digest (optional), weekly digest (default):** everything else — rolled into the
  Friday report email with deep links.
- **Per-user preference matrix** (event type × channel in-app/email), sensible defaults,
  one-click "too noisy" downgrade link in every email footer.
- In-app stays primary and goes **live via SSE** (bell updates instantly, M0).

---

## 9. Exports

- **CSV/XLSX everywhere a table renders** (projects, tasks, risks, allocations, time) via
  one shared export utility — cheap, endlessly requested.
- **Server-side PDF** for reports and check-ins: headless Chromium (Playwright is already
  in the toolchain) rendering the existing print-HTML as an async job attached to the
  `SharedReport` — no new rendering stack.
- **PPT Exco pack** (stakeholder ask): generated from the report registry — parked until
  the CBA/benefits model exists, because a benefits deck without benefit numbers is
  decoration.

---

## 10. Architecture (carried from v1, extended)

The v1 backbone stands — it's the substrate for everything above:

- **Jobs runtime:** host crontab → `POST /api/internal/cron` (`CRON_SECRET`, DM1.15) →
  dispatcher → named jobs with `JobRun` observability + mandatory idempotency keys.
  Every job loops tenants with `set_config('app.tenant_id', …)` — DM1.18.
- **Domain event outbox:** `DomainEvent` written in the mutation's transaction; consumers:
  notifications, activity feed, delta feed, digests, (later) webhooks. One write path,
  many reactions.
- **Snapshots:** nightly `ProjectSnapshot`/`PortfolioSnapshot` → trends, deltas, check-in
  drafts, burnup.
- **One health engine** (`src/server/health.ts`): PRD RAG formula, unit-tested; every
  surface calls it. Parity test: dashboard RAG === Q RAG for 100% of projects.
- **New in v2:** `Mailer` interface; connector framework generalized (github + hr-absence
  share the adapter shape: pull, summarize, degrade to null); stage machine on `Project`;
  polymorphic `Comment`; document versioning; `Decision`, `LessonLearned`, `Requirement`.
- **Invariants (never move):** RLS on every query; machine actors (`nudger`, `scheduler`,
  `github-sync`, `hr-sync`) write `audit_log`; Q tools behind the same `can()` gates as
  the UI; derived-never-manual for progress/health/coverage; no PII in seeds; DM1.10 one
  shared dashboard.

---

## 11. Design language

- **Progressive disclosure:** ten-second dashboard → one-click drill-down → full tables.
  Density lives in drill-downs, never on the landing surface.
- **Trust affordances on anything Q-generated:** data scope + generated-at timestamp,
  "Simulated" badge in mock mode, distinct retry vs budget-exhausted states (carried from
  `MVP1-IMPROVEMENT-NOTES.md` 3.3).
- **State honesty:** intentional empty/loading states everywhere; overdue/over-allocation
  never colour-only (AA pass on pills + heatmap); suspended-user styling; one monospace
  date format.
- **Keyboard-first pass** on board and My Tasks (Linear's lesson: speed is a feature).
- Riverbank red / KCB green theming per tenant, tokens only (`08-design-system.md`).

---

## 12. Milestones

| # | Milestone | Scope | Size |
|---|---|---|---|
| **M0** | **The Cull + backbone** | Kill list §2 executed (ClickUp routes/UI/nav removed, fake-AI panels out, placeholders out, pg-boss out, dead components out); flags (`SPACES=off`, `EMAIL=off`, `COMMIT_AUTOMATION=off`); jobs runtime + `JobRun`; `DomainEvent` outbox (refactor 5 notification call sites); `health.ts` + parity test; SSE bell | L |
| **M1** | **Dashboard v2** | Nightly snapshot job; Today / Changed / At-risk layout; 3 KPIs + sparklines; heatmap rendered as drill-down; role composition; tables relocated; `/risks` + `/time` back in nav; milestone model merge | L |
| **M2** | **The weekly loop** | Friday check-in (drafted from events/snapshots, lead confirms, RAG override w/ reason+expiry); `ReportSubscription` + seeded defaults; Friday job → `SharedReport` + notification; delta section; unconfirmed-status handling | L |
| **M3** | **Nudger & escalation** | 6.4 signal matrix, `Nudge` dedupe (`entityId:signal:isoWeek`), needs-attention strip, exec digest section, per-user snooze, `list_nudges` Q tool | M |
| **M4** | **Conversation** | Polymorphic `Comment` + threads + @mentions on tasks/projects/risks/documents; promote-to-`Decision`; activity feed from events | M |
| **M5** | **Email** | `Mailer` (Graph/M365 adapter), digest-first policy, preference matrix, branded templates, digest job; flag on | M |
| **M6** | **Absence & capacity** | `Absence` + manual entry + CSV/ICS bridge (+ ERP API adapter when endpoint exists); dated allocations (`ProjectMember.startDate/endDate`); `User.capacityHoursPerWeek`; leave-aware utilization, badges, assignment warnings, nudge suppression, report exposure lines; `TimeEntry` retarget → `ProjectTask` | L |
| **M7** | **Delivery depth** | GitHub commit automation (webhook, parser, `TaskCommitLink`, raw-body proxy caveat); `ProjectTaskDependency` + cycle check + board surfacing; PM swimlanes; Mine filter (DM1.20) | M |
| **M8** | **Lifecycle & documents** | Stage machine + gate checklists (soft-block + audited override); document register (types, versions, review workflow); AI ingest → review screen → `Requirement` w/ source anchors; traceability coverage report; `LessonLearned` at closure | XL |
| **M9** | **Exports & hardening** | CSV/XLSX export util on all tables; async server PDF for reports; drop deprecated ClickUp tables (post data-check, DM1.18 pattern); Playwright e2e smoke (login → board → check-in → Friday report); CI pipeline; docs refresh (`09-ui-spec.md`) | M |

**Sequencing logic:** M0 cuts create the room; M1–M2 change what people *see* and
establish the ritual; M3–M5 make it talk back (in-app, then email); M6 makes it aware of
reality (leave/capacity); M7–M8 deepen delivery and governance; M9 pays down and hardens.
Weekly loop lands by M2 — the highest-value ask stays early.

**Parked, pending business input** (do not guess — per `14-stakeholder-feedback-backlog.md`):
milestone templates per project type, prioritisation scoring model, CBA/benefits model +
typed money, PPT Exco pack, Oracle Fusion budget pull, native Teams integration.

---

## 13. Data model changes (summary)

| Model | Change | Milestone |
|---|---|---|
| `JobRun`, `DomainEvent` | new | M0 |
| `ProjectSnapshot`, `PortfolioSnapshot` | new | M1 |
| `CheckIn` (project, isoWeek, draft/confirmed, narrative, ragOverride+reason+expiry) | new | M2 |
| `ReportSubscription` | new | M2 |
| `Nudge` | new | M3 |
| `Comment` (polymorphic), `Decision` | new | M4 |
| `NotificationPreference` | new | M5 |
| `Absence`; `ProjectMember.startDate/endDate`; `User.capacityHoursPerWeek`; `TimeEntry.taskId` retarget | new/change | M6 |
| `TaskCommitLink`, `ProjectTaskDependency` | new | M7 |
| `Project.stage` + `StageTransition`; `ProjectDocument` versioning fields; `Requirement`, `LessonLearned` | new/change | M8 |

All new tables: `tenant_id`, RLS policy, isolation test. All data migrations: DM1.18
tenant-loop pattern or app-level backfill.

---

## 14. Success metrics

- **Weekly loop:** ≥90% of check-ins confirmed by Monday 10:00; ≥90% of Friday reports
  opened within 3 days; zero ad-hoc "what's the status?" asks on Fridays.
- **Daily loop:** median task staleness < 3 business days; ≥60% of overdue tasks move
  within 48h of first nudge; comments/@mentions used on ≥50% of active projects within
  a month of M4.
- **Trust:** dashboard RAG === Q RAG for 100% of projects (automated parity test); zero
  "soon"/fake-AI surfaces.
- **Awareness:** zero nudges sent to people on leave; zero tasks assigned into a leave
  window without a warning shown.
- **Quality:** CI green on every merge; e2e smoke stable; ClickUp tables dropped with no
  data loss.
