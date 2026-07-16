# Claude Code Prompt — Personalized Dashboards, Role-Scoped Admin, Personalized Q

Copy everything below into Claude Code, run from the QUBIT repo root.

---

Read `MVP1-IMPROVEMENT-NOTES.md`, `DECISIONS.md` (DM1.1), `docs/07-auth-rbac.md`, `src/lib/rbac.ts`, `src/server/dashboard.ts`, `src/server/nav.ts`, `src/server/q/report.ts`, `src/server/q/agent.ts`, and `src/app/(app)/dashboard/page.tsx` before writing any code. Work the phases below in order; **stop for review after each phase**. Follow repo conventions: RLS + `forTenant`, `can()` server-side on every route, Zod validation, audit every mutation, tokens-only styling, tests alongside code.

## Problem

Every user currently lands on the same dashboard showing the same "3 things need your attention" briefing, computed from portfolio-wide data regardless of who is looking. Q reports and My Tasks are likewise viewer-agnostic. Fix: role- and identity-personalized dashboards, a scoped admin console, and viewer-aware Q — on top of a corrected permission model.

## 1. Canonical roles (Phase 1)

Consolidate to these tenant roles (map/migrate existing role grants; document mapping in `docs/07-auth-rbac.md`; write a `DECISIONS.md` entry):

| Role | Meaning |
|---|---|
| `PlatformSuperAdmin` | Superadmin — full admin console, all write access |
| `HeadOfProjects` | PMO lead — delivery governance across all projects |
| `HeadOfQA` | QA lead — quality governance across all projects |
| `Executive` | CEO/CTO/executives — read-everything, no admin, no user mgmt |
| `ProjectManager` | Runs the projects they lead or are PM-member of |
| `Member` | Executes assigned work (default role) |

Multi-role users are allowed. Seed: align Riverbank users per DM1.1 (Executive Office members get `Executive`; QA `headUserId` gets `HeadOfQA`; PMO head gets `HeadOfProjects`).

## 2. Permission model (Phase 1) — extend `can()`

**Global read, scoped write.** All authenticated users can READ all portfolios, projects, tasks, risks, blockers, milestones, docs in their tenant. WRITE is scoped:

| Action | Who |
|---|---|
| `admin:access` (console visible) | SuperAdmin, HeadOfProjects, HeadOfQA |
| `users:create/suspend/roles/reset` | SuperAdmin **only** |
| `users:invite` | SuperAdmin, HeadOfProjects, HeadOfQA |
| `departments:manage` | SuperAdmin; heads manage **their own** department only |
| `teams:create` | Everyone (incl. Executive, Member). Creator becomes team lead |
| `teams:manage:own` | Team lead (rename, add/remove members, set lead) |
| `teams:manage:all` (archive/delete any) | SuperAdmin, heads |
| `project:create` | SuperAdmin, heads, ProjectManager |
| `project:write` (fields, dates, members, milestones) | Project lead, PM-role members of that project, HeadOfProjects, SuperAdmin |
| `project:join:request` | Everyone → creates a **join request**; project lead/PM approves; approval assigns project role (+ optional allocation %). Executives who join default to role `Stakeholder` (read+comment) |
| `task:write` | Task assignee (status/progress/comments); project lead/PM (everything); HeadOfQA may edit status of tasks in `Testing`/`UAT` phases |
| `risk/blocker:write` | Owner + project lead/PM + heads |
| `budget:read` | SuperAdmin, Executive, heads, and the project's lead/PM — **hidden from Members** (see Challenge C3) |
| `report:resource:self` | Everyone |
| `report:resource:others` (a named person's workload) | SuperAdmin, **Executive, HeadOfProjects, HeadOfQA — any person, any project** (decided 2026-07-15); PMs only for members of their own projects; Members self only |
| `report:portfolio` | Everyone (read-all world) |

Enforcement rules: every mutation route re-checks `can()` server-side; dashboard/Q endpoints derive the viewer from the session — **never accept a role or userId scope from the client**; join-approval and role grants write audit rows. Add a **permission matrix test** (`tests/rls/permissions-matrix.test.ts`): for each role × action above, assert allow/deny via the API (not just the helper).

## 3. Personalized relevance engine (Phase 2)

One server module `src/server/relevance.ts`: `getBriefing(viewer): BriefingItem[]` returns the top-3 "needs YOUR attention" items **scoped to the viewer**, replacing the shared briefing:

- Candidate pools by role — Member: my overdue/blocking tasks, blockers I own, approvals waiting on me. PM: my projects' escalations, join requests pending my approval, AI plans awaiting my approval, my projects' overdue milestones. HeadOfProjects: projects with no lead, worst RAG movers, PM over-allocation, stale status (>14d without update). HeadOfQA: blocked-in-test tasks, high-severity issues, upcoming UAT milestones at risk. Executive: portfolio RAG deteriorations, critical blockers, milestone slippage. SuperAdmin: platform items (below) + portfolio worst-3.
- Score by (urgency × ownership proximity × severity); tie-break by dueDate. Deterministic, unit-tested with fixtures — two different users on the same tenant MUST get different briefings when their work differs (test this explicitly).

## 4. Dashboards (Phase 3)

One dashboard shell, per-role composition (no six divergent pages — a `DashboardConfig` per role selecting from a shared widget library). Route on sign-in via role priority: SuperAdmin → Heads → Executive → PM → Member. Users with multiple roles land on the highest and can navigate to any dashboard their roles allow (nav pills).

- **Superadmin** (`/admin/overview` or dashboard variant): directory stats (active/suspended/invited, dormant >60d), invite aging, MFA adoption %, recent privileged audit events (role grants, suspensions, permission changes), AI usage from `AiCallLog` (calls/tokens today vs budget, top purposes), data-quality flags (projects without lead or dueDate, unassigned overdue tasks), failed background jobs if any — plus a compact portfolio strip. Q rail = admin insights (exists in design handoff).
- **Executive**: RAG heatmap + week-over-week deltas, projects-at-risk list, critical blockers, upcoming milestones, budget rollup. **No task rows, no operational buttons.** Read-only affordances throughout.
- **Head of Projects**: all projects grouped by RAG with PM column, unstaffed/leadless projects, pending plan approvals across projects, PM workload spread, overdue milestones by project.
- **Head of QA**: tasks in Testing/UAT by status, blocked-in-test list, issues by severity, QA team workload (QA department members), upcoming UAT/SIT milestones.
- **Project Manager**: my projects cards, tasks-by-status across my projects, my open risks/blockers, my team workload, pending join requests + plan approvals, my milestones.
- **Member**: lands on **My Tasks** as home (see §6).

Every dashboard keeps the briefing hero — fed by `getBriefing(viewer)` so the "3 things" are personally relevant. Acceptance: sign in as six seeded users (one per role) — six visibly different dashboards, zero identical briefings, both tenants, both themes AA.

## 5. Admin console scoping (Phase 4)

- Nav shows Admin only with `admin:access`.
- **SuperAdmin**: full console (Users CRUD + roles + suspend + reset, Organization, Teams, Roles, audit view).
- **Heads**: scoped console — Users tab read-only + Invite button; Teams full; Organization limited to their own department (rename, set head, membership). No role grants, no suspensions, no security settings. Enforce server-side per action, not by hiding tabs.
- **Executive/Member**: no console. They can still: create a team (from Teams page, not admin), request to join a project (project page button → PM approval queue).

## 6. My Tasks personalization (Phase 5)

Keep the ranked list; add role-aware buckets and rails: Member = current buckets (Overdue / Due this week / Open / Recently completed) + "Blocked — waiting on others" (dependency-aware once deps land). PM adds "Assigned by me" and "Awaiting my approval" (join requests, AI plans). HeadOfQA adds "In test". Focus summary and reminders rail must reference the viewer's own items only. Empty-state per role ("No tasks assigned yet — join a project to get started" with the join CTA for Members).

## 7. Q personalization (Phase 5)

- Inject viewer context into every Q call: `{ userId, name, roles, departmentId, myProjectIds, myTaskCount }`. System prompt: address the user, prioritise their scope first, then tenant-wide.
- **Q tools enforce the same `can()` gates** as the UI: Executives, heads, and SuperAdmin may ask Q about any person's workload and any project's report; PMs about their own projects' members; Members about themselves only — the person-workload tool refuses out-of-scope individuals and offers the team aggregate instead. Test this at the tool layer — not just the prompt (prompts are not a security boundary; a jailbroken Q must still hit the gate).
- Role-default report: "give me a report" with no type → Member: member report; PM: manager report over *their* projects; Executive/heads: portfolio; SuperAdmin: portfolio + platform note.
- Role-aware suggestion chips: Member "What's my week look like?" / PM "Status of my projects" / Exec "Portfolio brief" / HeadOfQA "What's stuck in testing?" / SuperAdmin "Platform health".
- Mock mode (`mock.ts`) must honour identical gates and personalization so keyless demos behave the same.

## 8. Tests & acceptance (every phase)

- Permission matrix test (§2) is the spine — write it FIRST, red, then implement.
- Relevance unit tests with fixtures; dashboard route tests per role; Q tool-gate tests (real + mock); join-request flow test (request → approve → write access appears; deny → stays read-only); RLS suite stays green.
- Manual sweep: six role-seeded users × two tenants × two themes. `pnpm lint && pnpm typecheck && pnpm test` green before each review stop.
- Update `docs/07-auth-rbac.md` (matrix), `docs/09-ui-spec.md` (dashboards), `CHANGELOG-mvp1.md`, and add `DECISIONS.md` entries for every judgment call.

## Assumptions baked in (flip them if Joyce disagrees — see chat)

1. Joining a project requires lead/PM **approval**; instant self-join would nullify write-scoping.
2. Budgets hidden from Members.
3. Individual workload reports: Executives + both heads + SuperAdmin may query **anyone** and **any project** (confirmed by Joyce 2026-07-15); PMs their own project members; Members themselves only.
4. Heads get a **scoped** admin console, not user CRUD.
5. Executives joining a project default to Stakeholder (read+comment), not a delivery role.
6. Team creators become team lead; only lead/heads/superadmin manage that team afterwards.
