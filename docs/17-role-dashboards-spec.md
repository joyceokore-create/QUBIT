# 17 — Role-Based Dashboard Specification

**Status:** Proposed · 2026-07-28
**Owner:** Joyce Okore
**Relates to:** `16-revamp-plan.md` (extends M1 "Dashboard v2"), DM1.10, DM1.3, DM1.20
**Audience:** Claude Code — these are build instructions. Follow exactly; stop for review per milestone.

---

## 0. Governing decision: composition, not forks (DM1.10 amended, not reversed)

We are NOT rebuilding five divergent dashboard pages (that was tried and deleted — DM1.10).
We are building **one dashboard shell + a widget registry + five role presets**:

- Every widget is a self-contained component with a defined data source and permission gate.
- A **preset** = ordered list of widgets + default data scope for a role.
- On login, the user lands on `/dashboard`, which renders the preset for their resolved
  role persona (see §1). Same route, same shell, different composition.
- Global read stays (DM1.3). Role scoping is a **default filter, never a visibility wall**
  (DM1.20): a PM's dashboard defaults to "my projects" with a scope toggle to "all";
  a developer can still navigate anywhere.
- Widgets shared between presets are the SAME component. If two roles show health, they
  call the same health engine. No per-role math forks.

Record this as a DECISIONS entry (DM1.22) when implementing.

## 1. User groups, personas, and onboarding

**Terminology:** a *user group* is the persona a dashboard preset targets:
`executive | pm | developer | qa | implementor`. A user can belong to **more than one**.

### 1.1 How groups are held (two sources, merged)

1. **Derived (authoritative once memberships exist):** the union of
   `projectRoleCategory()` across all of a user's project memberships, plus `executive`
   for tenant roles `Executive`, `HeadOfProjects`, `HeadOfQA`, `PlatformSuperAdmin`,
   plus `pm` for anyone leading ≥1 project.
2. **Declared (set at onboarding):** `User.userGroups` (array) + `User.primaryGroup` —
   chosen by the admin at invite time. This covers the day-one gap: a new developer with
   zero memberships still lands on the developer dashboard, not a generic page.

Effective groups = derived ∪ declared. `primaryGroup` decides the landing preset; if
unset, priority is `executive > pm > implementor > qa > developer`. Resolved at login and
stored on the session (same lifecycle as permissions, DM1.7).

**Groups are presentation, not permission.** RBAC stays exactly as is (tenant role +
`RolePermission` + membership-scoped writes). Removing someone's `qa` group changes what
they land on, never what they may do.

### 1.2 Multi-group users

- A PM who also does QA holds `{pm, qa}`: lands on their `primaryGroup` preset, and a
  **persona switcher** in the dashboard header lists their other groups. UI control, not
  a security control.
- Heads (`HeadOfProjects`/`HeadOfQA`) land on executive with a "delivery" lens toggle
  swapping in the PM/QA action widgets.
- Switcher choice persists per user (last-used group wins next login).

### 1.3 Onboarding flow (invite/admin changes)

1. Admin invites user: name, email, **tenant role** (RBAC), **user group(s)** with one
   marked primary. Invite screen shows a live preview chip: *"Will land on: Developer
   dashboard"*.
2. Admin (or PM later) adds project memberships with project roles; derived groups merge
   in automatically — no re-onboarding. Adding someone to a project as "QA Engineer"
   adds `qa` to their effective groups on next login.
3. First login: one-time 3-item checklist per primary group (dev: "confirm your tasks";
   PM: "confirm team + allocations"; qa: "review your test queue"; implementor: "review
   upcoming go-lives"; exec: none — straight to value).
4. `/admin/users` shows effective groups (declared + derived, visually distinct) and
   lets admins edit declared ones. All changes audited.

**Schema:** `User.userGroups String[]` + `User.primaryGroup String?` (enum-validated in
Zod). Migration is additive — DM1.18 pattern not needed beyond defaults.

## 2. Executive preset (revise current Command Center)

The current screen (screenshot 2026-07-28) is the base. Changes:

**Keep** — briefing hero with decision count + 3 ranked cards (this is the best part;
it stays the headline), health score with week delta, heatmap concept, Ask Q.

**Strip:**
- KPI tiles `Total items` and `Portfolios` — vanity counts; they answer no question.
- `Budget used 54%` — computed from regex-parsed strings (`parseBudget`); remove until
  money is typed (16-revamp §2). An exec KPI that can be wrong is worse than none.
- The health ring visual — replace with a compact score + 8-week sparkline. A lone "68"
  ring is decoration; the trend is the information.

**Fix:**
- Health score gets a "why?" popover: the health engine's factor breakdown (delays,
  risks, blockers, overdue) — never an unexplained number.
- Heatmap axis: Riverbank has **no subsidiaries** (DM1.1). Axis is **Portfolio ×
  Department** for Riverbank; Portfolio × Subsidiary stays for KCB (axis chosen by
  tenant's org-unit count, same rule that hides the Subsidiaries nav).
- Heatmap cell = ONE encoding: RAG color + Δ arrow vs last week. Drop "64% · 4 items ·
  On Track" per cell (three encodings per cell is why nobody reads it). Count/progress
  appear on hover and in the drill-down.

**Add:**
- KPI row (exactly 4, each with WoW delta from snapshots): On-track %, At-risk count,
  Open escalations, Capacity pressure (people over-allocated next week).
- **Decision queue** widget: escalations + stage-gate approvals + unconfirmed check-ins,
  with owner, age, one-click action. This is the exec's job in one table.
- Reports tab (§6).

Wireframe (top → bottom): `hero | health-trend` → `4 KPIs` → `decision queue` →
`heatmap | milestones-30d + top-5-risks`.

## 3. PM preset

First question answered: *"Are my projects on track this week, and what's stuck on me?"*

Order: 
1. **Hero**: check-in status ("Check-in due Friday" / "2 unconfirmed"), blockers >3 days,
   drafts awaiting approval — from relevance engine's PM pool.
2. **Project cards** (default scope: projects I lead/manage; toggle to all): RAG + Δ,
   progress, next milestone + date, open blockers count, "vs portfolio avg" chip
   (the comparison ask), "unconfirmed" badge when a check-in is missed.
3. **Action queue**: pending approvals (draft plans, join requests), blockers needing
   action, tasks slipping this week. Every row has an inline action.
4. **Team load**: members across my projects — allocation bar, leave badge (M6),
   over-allocation flag. Data: `listWorkload` filtered to my project members.

No portfolio heatmap, no tenant-wide KPIs — the PM's unit of thought is the project.

## 4. Developer preset

First question answered: *"What do I work on right now?"*

1. **Focus task** hero: ONE task (relevance-ranked: overdue > due soonest > in-review
   feedback), with a "start" deep link to the board card. Not a list — a decision made
   for them.
2. **Queue buckets** (counts + expandable lists): Overdue · Due this week · In review ·
   Blocked (with blocker reason inline).
3. **My boards**: projects I'm assigned to → deep link to board with dev lens preset
   (`?lens=dev`).
4. **Done this week**: small momentum list (feeds standup; later the weekly self report).

Nothing portfolio-level. A developer dashboard with an org heatmap is noise. Data:
existing `my-tasks` queries + `board-lens.ts`; this preset largely *re-homes* My Tasks
as the landing view — keep `/my-tasks` as the full-page version.

## 5. QA preset

First question answered: *"What's ready for me to test, and which of my bugs are stuck?"*

1. **Hero**: "N tasks in QA · M critical bugs unassigned · K aging >5 days" (QA pool of
   the relevance engine + `listTasksInTestPhase`).
2. **Test queue**: InQA items grouped per project, aging tint (reuse board-lens QA logic),
   triage group for unassigned bugs.
3. **Bugs I raised**: reporter=me, status + severity + reopened flag — the "issues I've
   raised on projects" ask.
4. **Project quality strip**: per project I'm on — open bugs by severity, reopen rate,
   link to project risks; requirement coverage % joins after 16-revamp M8.

## 6. Reports tab (all personas)

One Reports surface (`/reports`, existing centre) reachable as a dashboard tab, with an
**entity picker**: Person · Project · Portfolio · Delivery — exactly the existing report
types, gated by the existing `canAccessReport` matrix (execs/heads: anyone/anything;
PMs: their project members; developers/QA: self + their projects).

Per entity: period selector (week/month), generate, share, export, and — once 16-revamp
M2 lands — a **Subscribe** button (weekly push). The dashboard does summaries; the
Reports tab does depth. Do not duplicate report content as dashboard widgets.

## 7. Implementor (new persona — CONFIRMED 2026-07-28)

Decision confirmed by owner: add `Implementor` as a fifth `projectRoleCategory()`
alongside `PM | Dev | QA | Stakeholder`. Add project roles "Implementation Lead",
"Implementor", "Trainer", "Support Analyst" to `PROJECT_ROLES` in `src/lib/roles.ts`,
mapped to the new category. Record as a DECISIONS.md entry (DM1.23). No data migration
(same pattern as 6.1); existing members keep their current roles.

Preset (first question: *"What goes live next, and is it ready?"*):
1. **Hero**: next go-live + open gate items.
2. **Pilot/UAT projects**: stage, gate checklist state, go-live date (stage machine is
   16-revamp M8; until it ships, filter on project status/milestones tagged UAT/pilot —
   ship the preset with this interim data source and note it).
3. **Rollout issues**: Issues on those projects, severity, owner.
4. **Go-live calendar (30d)** and **handover docs pending approval**.

## 8. Build order (fits 16-revamp-plan)

1. **M1a** — widget registry + preset resolver + persona resolution at login; executive
   preset (revised per §2) as the first consumer. Requires snapshots (M1) for deltas.
2. **M1b** — developer + PM presets (highest daily traffic).
3. **M1c** — QA preset; Implementor category decision + preset (interim data source).
4. Reports tab Subscribe wiring lands with 16-revamp M2; leave/capacity chips with M6;
   gate checklists with M8.

## 9. Acceptance criteria

- One route `/dashboard`; preset chosen by session persona; persona switcher for mixed
  roles; scope toggles present wherever a default filter is applied (no visibility walls).
- Onboarding: inviting a user with declared groups but zero memberships lands them on
  their primary-group dashboard on first login; adding a project membership merges the
  derived group by next login; a user with `{pm, qa}` can switch presets and the choice
  persists. Group changes are audited and never alter permissions (test both directions).
- Two users with different personas see different first screens (extend the existing
  "two users get different briefings" test pattern to presets).
- Every number with a WoW delta reads from snapshots; health always from `health.ts`;
  parity test passes (dashboard === Q === reports per project).
- No widget renders for a user whose `can()` gate fails its data source; Q answers about
  the same data respect identical gates.
- Zero "soon" placeholders in any preset. A widget ships when its data is real.
- Both tenants themed correctly; heatmap axis switches by org-unit count; RLS isolation
  tests for every new query; `lint`/`typecheck`/`test` green; mutations audited.
