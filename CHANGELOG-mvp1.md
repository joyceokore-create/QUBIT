# Changelog — MVP1 (Riverbank: user & project management + Q copilot)

Plan: `~/.claude/plans/glistening-forging-rivest.md`. Built on the existing PPM app,
dedicated dev DB `qubit_clickup`. Every table tenant-scoped + RLS; mutations audited;
no real PII in the repo.

## Admin console redesign — onboarding-first (2026-07-14)

Reworked the admin console so teams, PMs and developers get onboarded *effectively* and
their progress is visible.
- **Onboarding overview strip** — six tiles: **fully onboarded** + filter segments **All /
  Never signed in / No MFA / Unassigned / Suspended**. Each tile filters the directory to
  who's stuck.
- **Per-user onboarding completeness** — the directory shows a 3-step indicator (**signed
  in · MFA · placed on a team/project**) with an `x/3` count, so you can see at a glance who
  isn't ready. `listUsers` now returns `teamCount`/`projectCount`.
- **Invite places them on day one** — the wizard's Access step gained **Team + Project (with
  a project role)**; `createUser` creates the team/project memberships atomically. A new
  developer lands with a role *and* a project.
- **Q · Onboarding insights** + an onboarding-checklist explainer in the rail.
- `tests/rls/onboarding.test.ts` extended: invite-with-placement sets teamCount/projectCount.
  **Full suite 171/171.** typecheck + lint clean; console + wizard screenshotted.
- (Also fixed the transient **"could not create user"** — the dev server was running a stale
  Prisma client from before the recent migrations; a restart resolved it. Create now 201s.)

## Seed super-admins only · tenant switch · 3-step invite wizard (2026-07-14)

- **Seed trimmed to super-admins** — each tenant now seeds ONLY its super-admin (Riverbank
  `joyce`, KCB `daniel`, both SystemAdmin + PlatformSuperAdmin); every other user is
  onboarded in-app. `resetTenant` updated to clear all MVP1 tables. Reseeded.
- **Tenant switching works** — the tenant chip now signs you out and routes to login for the
  chosen org (a user belongs to one tenant; RLS is never crossed). Was a "coming soon" stub.
- **3-step invite wizard** — the admin invite is now **Details → Access → Review** with a
  step indicator, per-step validation, a review summary, and the temp-password hand-off.
- **Fixes:** `DropdownMenuLabel` is now a plain div (Base UI's GroupLabel threw
  "MenuGroupContext missing" outside a group — hit when opening the switcher); split
  `background` + `backgroundSize` into `backgroundImage`/`backgroundColor` on the
  login/onboarding/landing canvases (React shorthand warning).
- **Tests:** since only one user is seeded per tenant, added `tests/rls/_users.ts`
  (`ensureUsers`/`cleanupFixtureUsers`) and switched multi-user tests to it; all
  `user.findFirstOrThrow()` now select ACTIVE users (a soft-deleted user could poison
  `listWorkload`-based reports). Serialised DB-backed test files (`fileParallelism:false`)
  to stop cross-file contention. **Full suite 170/170, deterministic.** typecheck + lint clean.

## Milestones + first-login acceptance flow (2026-07-14)

### Workspace milestones (PRD Module 8) — a real Deadlines tab
- `ProjectMilestone` model + migration + RLS; `src/server/milestones.ts` (list/create/
  update/delete, audited; **overdue** derived = Pending with a past due date).
- `GET/POST /api/projects/{id}/milestones`, `PATCH/DELETE /api/milestones/{id}`.
- The **Deadlines** tab now shows **Milestones** (add, due date, tick-to-complete, overdue
  in red) above the Blocker Register — the schedule, not just impediments.
- `tests/rls/milestones.test.ts` (3): CRUD, overdue derivation, done clears overdue, isolation.

### First-login acceptance (forced password reset)
- `User.mustChangePassword` (migration), set on **invite** (`createUser`) and **bootstrap**.
  `authorize` returns it → JWT/session carry it (`next-auth.d.ts`).
- Gate in the **(app) server layout** (redirect to `/onboarding`) — deliberately not edge
  middleware, where custom session-callback fields don't reach `req.auth`. `/onboarding`
  lives outside the group, so no loop.
- `/onboarding` page + `completeOnboarding` (`POST /api/onboarding/complete`) — validates
  policy + no-reuse, sets the new password, clears the flag; the form calls
  `useSession().update()` to lift the gate without a re-login.
- Verified end-to-end: invite → temp-password login → **gated to /onboarding** → set
  password → **/dashboard** → free navigation; DB flag flips to false.

**Full suite 170/170.** typecheck + lint clean; onboarding screen + Deadlines screenshotted;
test invitee + demo data purged.

## Onboarding tracking + Kanban board (2026-07-14)

Two tracking upgrades — one per the "onboarding + workspace" focus.

### Onboarding is now a tracked process
- `User.lastLoginAt` (migration `20260714190000_user_last_login`), set on every successful
  sign-in (`src/lib/auth.ts`, best-effort).
- `listUsers` exposes `lastLoginAt` + `mfaEnabled`. The admin Users table shows **Last
  active** ("Never signed in" in amber) and a **no-MFA** badge on admin accounts; Directory
  gained a **never-signed-in** stat; Q · Admin insights now report real signals (invited
  users who haven't signed in, admins without MFA) instead of hardcoded text.
- `tests/rls/onboarding.test.ts` — a new user reads as never-signed-in, no MFA.

### Workspace "Board" is a real Kanban
- `ProjectBoard` — four status columns (Not started / In progress / Blocked / Completed),
  **drag a card between columns** (HTML5 DnD) *or* use each card's status menu; optimistic
  update → `PATCH /api/tasks/{id}`; live progress bar; quick-add in "Not started";
  "Generate from document" (reuses the AI/mock generate dialog). Replaces the flat checklist
  in the workspace Board tab. Low-friction status updates keep tracking data fresh.

**Full suite 167/167.** typecheck + lint clean; admin onboarding view + board screenshotted;
demo data purged.

## Q mock mode — pushed further (2026-07-14)

More capability on the no-key path:
- **Typo-tolerant matching** — Levenshtein fuzzy on project/person names (stopword-filtered,
  ≥5 chars, edit-distance ≤1) so "who runs anchr fal" still resolves, without hijacking
  global questions.
- **Project comparison** — "compare RBS-24 and RBS-26" / "X vs Y" → side-by-side status,
  progress, blockers, due.
- **Suggested actions** — "what should I do about X?" derives recommendations (assign lead,
  escalate critical blocker, re-plan overdue tasks, rebaseline, rebalance workload).
- **Person deep-dives** — "what is George blocked on / working on / should do next" →
  owned blockers, their projects, and a prioritised to-do (overdue assigned tasks + unblocks).
- **Documents** — "does X have a BRD?" lists a project's attached docs.
- **Time queries** — "what's due this week / overdue" across the portfolio.
- **Help** — "what can you do?" / greetings list example questions.
- **Honest fallback** — unmatched questions get a portfolio snapshot + a nudge to say "help".
- `tests/rls/q-mock.test.ts` still green; **full suite 166/166**; typecheck + lint clean;
  compare / actions / help screenshotted.

## Q mock mode — smarter, still no key (2026-07-14)

Made the deterministic copilot meaningfully more capable:
- **Conversation follow-ups** — resolves the project from the current turn, and falls back
  to earlier turns *only* for anaphoric questions ("its blockers?", "and who's in charge?")
  so fresh global questions aren't hijacked by a stale project.
- **Compound questions** — "status *and* blockers of X" returns both sections in one reply
  (aspect detection → multi-section compose).
- **Heuristic "why is X at risk"** — derives reasons from data: overdue tasks, open/critical
  blockers, open risks, behind-schedule (progress vs elapsed timeline), over-allocated members.
- **Attention briefing** ("what needs my attention today?") — ranks at-risk projects,
  critical blockers, over-allocation across the portfolio.
- **Counts & superlatives** — "how many open blockers?", "who has the most work?",
  "which project is most at risk?".
- **Fuzzier entity matching** — code with/without dash, name-word overlap, acronyms.
- `tests/rls/q-mock.test.ts` extended (follow-up context, compound, briefing, superlative).
  **Full suite 166/166.** typecheck + lint clean; screenshotted.

## Q mock mode — entity-aware answers + full BRD, no key (2026-07-14)

Made the no-key path genuinely useful (not just an LLM stand-in):
- **Entity-aware chat** (`mockChat`) — resolves the project (by code or name) or person a
  question names, then answers targeted lookups: **"who's in charge of X"** (lead +
  business owner + PM/lead members), "the team on X", status, blockers, risks, due dates,
  and per-person workload — all from live tenant data. Falls back to portfolio-wide answers.
  Added `getProjectPanelData.leadName`.
- **Comprehensive BRD** — the no-key `buildFallbackBrd` now templates *everything* the
  system knows: Overview (objective/mission/scope), Stakeholders (lead, business owner,
  every member + role, teams), Timeline + budget, **Requirements & deliverables grouped by
  phase (all tasks)**, all Risks, and open Blockers.
- `tests/rls/q-mock.test.ts` extended — "who's in charge" resolves the lead, "who's on X"
  lists the team. **Full suite 162/162.** typecheck + lint clean; both screenshotted.

The boundary: factual lookups + exhaustive templating are deterministic (done here); open
reasoning + free-form phrasing still need the real key (the agent loop already built).

## Q mock mode — demo without an Anthropic account (2026-07-14)

`Q_MOCK_AI=1` lets Q feel AI-powered with **no key**: `src/server/q/mock.ts` answers chat
from live tenant data via a keyword router over the same server functions the real tools
use (portfolio / at-risk / blockers / risks / workload / github), and generates a plan from
pasted text — all clearly labelled "Simulated Q". **Auto-disabled** the moment a real
`ANTHROPIC_API_KEY` is present. Wired into `runQChat` and `generatePlan`; added to `.env`.
(A fake `sk-ant-` key does NOT work — it 401s and falls back; use this instead.)
`tests/rls/q-mock.test.ts` (3) — grounded routing + plan-from-text. **Full suite 161/161.**

## Agentic Q — tool-using copilot (2026-07-14)

Q is no longer just fixed reports — it's a **tool-using agent** that answers free-form
questions by fetching real data on demand.

- `src/server/q/agent.ts` `runQChat` — a manual tool loop over the stable Messages API
  (adaptive thinking, max 8 steps). Nine **tenant-scoped tools** bound to the caller's
  `TenantContext`: `list_projects`, `get_project`, `list_tasks`, `list_blockers`,
  `list_risks`, `list_workload`, `read_documents`, `list_status_updates`, `github_status`.
  Because every handler runs under the request's ctx, **RLS makes cross-tenant access
  impossible** — the agent can't escape the tenant. Logs `chat` metrics to AiCallLog;
  graceful message when no `ANTHROPIC_API_KEY`.
- `POST /api/q/chat` `{ messages[], projectId? }` — multi-turn, gated on `dashboard:read`.
- **Q drawer** gained a persistent composer + chat transcript (user/assistant bubbles,
  markdown, "looking that up…" indicator, new-chat reset) alongside the report shortcuts.
- `tests/unit/q-agent.test.ts` — graceful fallback (no key → usedAi:false, no tools). The
  tools reuse already-tested tenant-scoped server fns. **Full suite 158/158.** typecheck +
  lint clean; chat flow screenshotted.

With a key, Q now answers open questions ("which projects are at risk and why?", "what's
the last commit on X?", "who's over-allocated?") by calling the tools — including the live
GitHub connector — and citing what it found.

## Project Workspace — phase 4: live connectors (GitHub) (2026-07-14)

Turns the integrations surface from config into live data, starting with GitHub.

- **Encrypted tokens at rest** — `secret` column on `ProjectIntegration` (migration
  `20260714180000_integration_secret`) + `src/lib/secret-box.ts` (AES-256-GCM, keyed on
  `INTEGRATION_ENCRYPTION_KEY`, falling back to `MFA_ENCRYPTION_KEY`). Tokens are never
  stored or returned in plaintext; connect captures a token, disconnect clears it.
- **Connector framework** `src/server/connectors/` — `getIntegrationSummary` /
  `getConnectedSummaries` decrypt the token and dispatch by provider. **GitHub** is live
  (`fetchGithubSummary` over the REST API — last commit, open PRs, fixed-vs-open issues in
  30d; native fetch, no dep; returns null on any error). Other providers return null until
  their connectors land — identical seam.
- **Live status on cards** — `GET /api/projects/{id}/integrations/{provider}/status`; the
  grid shows the live headline (e.g. "repo · N open PRs") for connected providers, and the
  Connect dialog has an **Access token** field for live providers.
- **Q grounded on connectors** — the project report now includes each connected tool's
  summary, so Q can answer "what's the last commit" / "which issues are fixed vs not".
- `tests/rls/connectors.test.ts` (5) — encryption round-trip, GitHub summariser (PRs
  excluded from issue counts), token stored encrypted, cleared on disconnect, safe nulls.
  **Full suite 157/157.** typecheck + lint clean; Connect-with-token dialog screenshotted.

**To go live:** paste a fine-grained GitHub PAT (Contents/PRs/Issues: read, scoped to the
repo) into a project's GitHub Connect. Remaining providers (YouTrack, Teams, Calendar,
Sentry) need their own connector + credentials.

## Project Workspace — phase 2 + UI rework + Integrations (2026-07-14)

Reworked the workspace to the new design (hero + tabbed workspace) and added the
status/notification loop plus the integrations surface.

### UI rework (matches the design)
- **Hero header**: brand-glow card with eyebrow (portfolio/programme · code), title +
  status pill, **progress bar** (task-based %), a **timeline chip** (days-to-close /
  overdue), **member avatars** + count, and the **Ask Q about this project** button.
- Tabs: **Overview · Board · Documents · Deadlines · Team · Integrations** (Overview =
  status feed + definition; Board = tasks; Deadlines = blockers; Team = resources).

### Status updates + notifications (phase 2)
- `ProjectStatusUpdate` + `Notification` models + migration + RLS.
- `postStatusUpdate` posts an update (RAG) and **notifies the project's managers + testers**
  (lead + members with a Project Manager / QA Lead role, poster excluded); Q-drafted BRDs
  also notify the assigned PM. `src/server/notifications.ts` (list/unread/markRead/all).
- **Notification bell** in the topbar (unread badge, dropdown, mark-all-read, deep links),
  and a **Status updates** feed + composer in the workspace Overview.

### Integrations surface (config for phase 4)
- `ProjectIntegration` model + migration + RLS; `src/server/integrations.ts` with a fixed
  provider registry (GitHub, YouTrack, Teams, Calendar, GitHub Actions, Sentry) merged with
  persistent per-project connect state + linked resource.
- **Integrations grid** matching the design: monogram, status dot, description, resource,
  Connect/Disconnect, and each card's **"Feeds Q: …"** note. Connect/Disconnect persists;
  **live data sync stays phase 4** (needs real provider credentials).

### Verification
- `tests/rls/workspace-loop.test.ts` (3) — status notify fan-out (lead + testers, poster
  excluded, mark-read), integration connect persistence, tenant isolation.
  **Full suite 152/152.** typecheck + lint clean; hero + Integrations screenshotted; demo
  data purged.

## Project Workspace — phase 3: Q on documents + Draft-a-BRD (2026-07-14)

- **Q grounded on documents** — `projectContext` now pulls attached text documents (BRD,
  plans; capped, PDFs listed not inlined) into the project report, so "Ask Q about this
  project" reflects the BRD, not just structured data.
- **Draft a BRD → submit to PM** — `src/server/q/draft-brd.ts` `draftBrd()`: Q reads the
  project record (description/objective/mission + team + tasks + risks) → drafts a Markdown
  BRD → files it as a document with **source=AIDrafted, status=PendingReview** (the review
  submission). Deterministic fallback BRD when no key; logs `brd:draft` to AiCallLog.
  `POST /api/projects/{id}/documents/draft-brd` (project:update).
- **Review loop** — Documents section gained **"Draft BRD with Q"** and, for
  Pending-review docs, a PM **"Approve"** action (→ Final). (In-app notification of the PM
  is phase 2.)
- `tests/rls/documents.test.ts` extended: draft-BRD (Pending/AIDrafted/BRD) + report
  grounded on an attached doc. **Full suite 149/149.** typecheck + lint clean; flow
  screenshotted; test data purged.

## Project Workspace — phase 1: full-page workspace + Documents (2026-07-14)

Promotes a project from a slide-panel summary to a first-class **Workspace** (the panel
stays as the quick glance). Foundation for docs, status updates, and future dev integrations.

- **Full-page workspace** `/(app)/projects/[id]` with tabs **Overview · Documents ·
  Execution · Ask Q**. Overview = stat tiles + definition + resources; Execution = tasks +
  blockers; Ask Q = grounded project report. Reuses the existing sections.
- **Membership-based access** (`src/lib/project-access.ts` `canViewProject`): a project's
  own members/lead can open the workspace even without the tenant-wide `project:read` role;
  editing still needs `project:update`.
- **Documents** — new `ProjectDocument` model + migration `20260714150000_workspace_documents`
  + RLS. `src/server/documents.ts` (list/get/create/updateStatus/delete, audited);
  `GET/POST /api/projects/{id}/documents`, `GET/PATCH/DELETE /api/documents/{id}` (view
  allows members; edit requires `project:update`). UI: add a BRD/plan/spec by **pasting
  text/markdown (Q-readable) or attaching a PDF**, list with kind/author/status, view
  (rendered markdown) or download (PDF), delete. Kinds: BRD/Plan/Spec/Note/Other; status:
  Draft/PendingReview/Final; source: Uploaded/AIDrafted (seam for Q-drafted BRDs).
- **Entry point**: "Open project workspace" from the slide-panel.
- `tests/rls/documents.test.ts` (3) — doc CRUD, tenant isolation, member-view access.
  **Full suite 147/147.** typecheck + lint clean; workspace Overview + Documents
  screenshotted; test data purged.

**Next phases:** (2) status updates + in-app notifications to PMs/testers; (3) Q grounded on
documents + "Draft a BRD → submit to PM for review" (source=AIDrafted, status=PendingReview);
(4) developer integrations (git/issue trackers) as Q tools.

## Task assignees + My Tasks page (member dashboard) (2026-07-14)

Made tasks assignable and gave every user their personal work view (PRD Member Dashboard).
- `updateTask` (status / **assignee** / **due date**, audited) + `UpdateTaskInput`;
  `PATCH /api/tasks/{id}` now accepts all three. `listMyTasks(userId)` added.
- Project-panel task rows gained an **assignee** dropdown (project members) and a **due
  date** control; overdue dates render red. `ProjectTask` already carried assignee/dueDate.
- **`/my-tasks`** page (nav: *My Tasks*, all users): the caller's assigned tasks bucketed
  **Overdue · Due this week · Open · Recently completed** — auto-derived from due date +
  status, tenant-scoped.
- `tests/rls/project-tasks.test.ts` extended: assign → `listMyTasks` (with project + due)
  + isolation. **Full suite 144/144.** typecheck + lint clean; My Tasks screenshotted;
  test data purged.

## PRD Modules 10–11 — Blocker Register + Manager/Member reports (2026-07-14)

### M10 Blocker Register
- New **`Blocker`** model + migration `20260714140000_mvp1_blockers` + RLS
  (`tenant_isolation_blocker`). Fields: description, **severity (Low/Medium/Critical)**,
  status (Open/Resolved), owner, resolution notes, date raised.
- `src/server/blockers.ts` — list / create / update (resolve) / remove (audited) +
  `getBlockerCounts` (Open / Resolved / Critical roll-up per PRD).
- `GET/POST /api/projects/{id}/blockers`, `PATCH/DELETE /api/blockers/{id}`.
- **Blocker Register** section in the project panel: severity pills, one-click **Resolve**,
  add-with-severity, delete. Distinct from Risk/Issue.

### M11 Manager + Member reports (Q)
- Added **`manager`** and **`member`** report types to the Q engine, grounded in the new
  task + blocker data:
  - **Manager report** — tasks by status, open risks, open blockers, upcoming milestones,
    over-allocated people.
  - **My work (member)** — the caller's projects/allocations + the risks & blockers they own.
- Wired through `POST /api/q/report` and the Q drawer (chips: Portfolio summary ·
  **Manager report** · **My work** · Report on a project). Deterministic fallback + AiCallLog
  as before.

### Verification
- `tests/rls/blockers.test.ts` (4) — blocker CRUD + counts (open/resolved/critical),
  tenant isolation, grounded **manager** + **member** reports. **Full suite 143/143.**
  typecheck + lint clean; blocker register + Q chips screenshotted; test data purged.

## PRD Module 2 — full project definition fields (2026-07-14)

Rounded out project definition to the PRD: added **client, objective, mission, business
owner, start date** (end date = existing `dueDate`).
- Migration `20260714130000_mvp1_project_fields` (5 nullable columns, back-compat).
- `CreateProjectInput`/`UpdateProjectInput` + `createProject`/`updateProject` (audited);
  `getProjectPanelData` returns them.
- Edit dialog gained Client / Business owner / Objective / Mission / Start–End date;
  the project panel shows a **Definition block** (Client · Business Owner · Timeline ·
  Objective · Mission) when any are set.
- Timeline **revisions** are captured by the existing audit log (before/after on every
  date change); a dedicated revisions view is a fast-follow.
- typecheck + lint clean · suite 139/139 · edit→persist→display verified, seed reverted.

## PRD Modules 5–7 — AI task generation + task management + auto-progress (2026-07-14)

The PRD's differentiator: turn a document into an executable, self-tracking task list.

### Data + server
- New **`ProjectTask`** model + migration `20260714120000_mvp1_project_tasks` + RLS
  (enabled/forced, `tenant_isolation_project_task`). Distinct from the ClickUp `task`.
- `src/server/project-tasks.ts` — `listProjectTasks`, `addTasks` (bulk approve/manual,
  audited), `setTaskStatus`, `removeTask`, **`getProjectProgress`** (completed ÷ total,
  PRD M7 — never manual), and **`generatePlan`** (PRD M3–M5): sends a **PDF natively to
  Claude** (base64 document block) or pasted BRD text, returns a validated phased plan
  `{summary, risks, phases:[{name, tasks:[…]}]}` — a preview, not persisted. Logs metrics
  to `AiCallLog` (`plan:generate`); graceful `AI_UNAVAILABLE` when no key (manual add
  still works). No new deps (PDF handled by the Anthropic SDK).

### API + UI
- `GET/POST /api/projects/{id}/tasks`, `POST /api/projects/{id}/tasks/generate`,
  `PATCH/DELETE /api/tasks/{id}` (gated project:read / project:update).
- **Tasks section** in the project panel: auto-progress bar, task rows with a status
  control (Not started · In progress · Blocked · Completed) + delete, manual quick-add,
  and a **"Generate from document"** dialog (paste BRD or attach a PDF → review the
  drafted phased tasks with per-task include checkboxes → **Approve & add**).

### Verification
- `tests/rls/project-tasks.test.ts` (5) — add/list order, **auto-progress** (1/3 → 33%,
  blocked count), AI-unavailable guard, **tenant isolation**, empty-add error.
  **Full suite 139/139.** typecheck + lint clean. Task list + progress + generate dialog
  screenshotted; test data purged.

## PRD alignment — professional onboarding + project-team roles (2026-07-14)

Aligned two modules to the MVP1 PRD (User Management; Project Team) after the official
PRD + Riverbank overview landed.

### Roles (`src/lib/roles.ts`, `src/lib/rbac.ts`)
- New **`Executive`** RBAC role — read-only portfolio + reports (PRD §5), distinct from
  PortfolioManager (which authors).
- `ONBOARDING_ROLE_TIERS` — the PRD's 4 system tiers (Administrator / Executive /
  Project Manager / Member) mapped to RBAC keys.
- `PROJECT_ROLES` — the PRD Module 2 project-team roles (Sponsor, Business Owner,
  Project Manager, Product Owner, Business Analyst, Technical Lead, QA Lead, Developer,
  UX Designer, Stakeholder).

### Professional onboarding (`admin/users` invite dialog)
- Rebuilt as a proper **"Invite user"** flow: name + work email, the 4 role tiers as
  descriptive selectable cards (single primary role), optional **org unit** at creation,
  an **auto-generated temp password** (with regenerate), and a **secure hand-off**
  success state (copy password + reset/MFA guidance). Replaces the raw all-roles
  checkbox list. `createUser` now accepts an optional `departmentId` (validated + set).

### Assigning users to projects (project panel Resources)
- Project-member **role is now a defined dropdown** of the PRD project-team roles
  (was free-text); allocation % kept as optional. Team assignment unchanged.

typecheck + lint clean · suite 134/134 · both surfaces screenshotted.

## Phase D — onboarding + deployment readiness (2026-07-14)

Everything needed to onboard **real** Riverbank data and deploy — the actual MVP1 goal.
(Running the import with the operator's real CSVs and provisioning the host are the two
steps that need real inputs/infra; everything else is built and verified.)

### Onboarding
- **CSV templates** (`docs/onboarding/templates/*.csv`) — synthetic (`@example.invalid`)
  examples the operator copies to a git-ignored `import/` and fills with real data.
- **Runbook** (`docs/onboarding/README.md`) — column contracts, valid enum values, the
  dry-run → execute → idempotency flow, secure credential hand-off, MFA, and QA steps.
- **Importer verified end-to-end** against the post-A/C schema: dry-run (warning-free) →
  `--execute` (4 depts / 4 people / 2 teams / 2 projects / 3 allocations, with manager
  links, team members, project leads, allocations all correct) → re-run (idempotent;
  allocations upsert) → report git-ignored → **test data purged** (0 rows remaining).

### Deployment
- `scripts/bootstrap-tenant.ts` — idempotent prod bootstrap that creates the tenant +
  first `SystemAdmin` (random one-time password) **without** the demo seed. Guarded on
  `ADMIN_EMAIL`.
- `.env.production.example` — full secret contract (managed Postgres w/ non-superuser
  role + `sslmode=require`, `AUTH_SECRET`, `AUTH_URL`, `MFA_ENCRYPTION_KEY`,
  `ANTHROPIC_API_KEY`, optional SSO).
- `docs/deployment.md` — runbook: secrets → `migrate deploy` (schema **+** RLS) → RLS
  verification query → bootstrap → build/run → onboard → post-deploy checks. Flags the
  "don't seed prod" and "app role must not bypass RLS" pitfalls.

typecheck + lint clean · suite 134/134.

## Colour/gradient parity with the prototype (2026-07-14)

Audited every CSS custom property against the prototype's `applyTheme()` — all colour
tokens (brand, backgrounds, 7 ink levels, RAG + tints, alpha-whites, overlays, shadows,
avatars) already matched exactly in both themes. Closed the remaining gradient gaps:

- **Theme-aware topbar** (was a plain surface): light mode is now the navy→green
  branded gradient (`linear-gradient(95deg,#0B2239,#11402E,color-mix(brand 75%))`) with
  white nav ink; dark mode is the dark bar with tenant-brand logo/active pill. Added the
  `--tb*` token set (both themes) and wired topbar / nav-pills / tenant-chip / theme
  toggle to them. Brand-dependent dark tokens resolve at a new `.app-shell` scope so the
  per-tenant `--brand` (Riverbank red / KCB green) applies — fixed a pre-resolution bug
  where they'd otherwise fall back to product green.
- **Landing hero** headline now uses the prototype's green (`#1B9152→#6FAE33`) and amber
  (`#D08A1D→#9E6317`) `background-clip:text` gradients; landing + **sign-in** backgrounds
  both use the prototype canvas (`1200×520 at 72% -160px` brand radial + 26px dot-grid
  over `--qbg`). Sign-in's radial still tints to the tenant as the email resolves.

Verified: dark topbar resolves `--tbglyph`/`--tbactivec` to `#f4434a` (Riverbank);
light + dark topbars and landing hero screenshotted against the prototype. Suite 134/134.

## Design pass — copy `Latest design.zip` exactly (2026-07-14)

Aligned two surfaces to the updated prototype (`Latest design.zip` → QUBIT Command
Center.dc.html), admin-specific.

### Q placed inside each project/portfolio
- `AskQAbout` button (`src/components/q/ask-q-about.tsx`) rendered in the project
  slide panel: **"Ask Q about this project"** — opens the Q drawer straight into a
  grounded project report (context-aware), mirroring the prototype's panel CTA.
- `QProvider` gained `openQWith({type,targetId})` + `pending`; the drawer auto-runs
  the pending report on open (no chip navigation needed), then falls back to the
  suggestion home.

### Admin console (Administration → Users) — exact prototype layout
- Rebuilt `admin/users` to the design: eyebrow (`{role} · {tenant}`), **Administration**
  title, **Users / Organization / Roles** tabs, and a two-column grid.
- Left: filter chips (All / Active / Suspended + counts) + avatar directory table
  (User · Role · Org unit · Status · Joined · Actions), preserving the existing
  invite/suspend/roles/department actions.
- Right rail: **Q · Admin insights** (grounded, computed from live data — suspended
  accounts, users with no org unit, joined-this-week, single-admin risk) + a
  **Directory** stat card (total / active / suspended / system admins). Tenant-themed,
  dark+light, token-only.
- typecheck + lint clean · suite 134/134 · screenshotted (Riverbank, dark).

## Phase C — Q reporting copilot (2026-07-14)

Greenfield Claude copilot that reports on the portfolio, a project, or a person's
workload — grounded strictly on the existing tenant-scoped data layer.

### Model + logging
- Added `@anthropic-ai/sdk` (0.111); model **`claude-opus-4-8`** (per the claude-api
  skill). `ANTHROPIC_API_KEY` is server-only, added to `.env.example`.
- New `AiCallLog` model + migration `20260714090000_mvp1_ai_call_log` + RLS
  (enabled/forced, `tenant_isolation_ai_call_log`). **Metrics only** — purpose /
  model / tokens / latency / `usedAi`; never prompt text, report content, or PII.

### Report engine — `src/server/q/report.ts`
- Three grounded report types assembled under `withTenant` (RLS):
  - **project** — panel data + `listProjectMembers`/`listProjectTeams` + project
    risks & issues.
  - **resource** — a person's `listWorkload` row (allocations, %, over-allocation).
  - **portfolio** — project status rollup + `getEscalations` + `getUpcomingMilestones`.
- System prompt: *use ONLY the provided JSON; if it's not in the data, say so.*
- **Graceful degradation:** with no `ANTHROPIC_API_KEY` (or on any Anthropic error)
  it returns a **deterministic Markdown** report built from the same data, so the
  feature works end-to-end without a key. Every call logged to `AiCallLog`.

### API + UI
- `POST /api/q/report` `{ type, targetId? }` → `{ markdown, usedAi, model }`, gated on
  `dashboard:read`, tenant-scoped.
- Real **Q drawer** (`src/components/q/*`): brand-glow header, suggestion chips
  (Portfolio summary · My workload · Report on a project + project picker),
  dependency-free Markdown renderer, loading skeleton, graceful-fallback note.
  Replaces the placeholder "Ask Q" toast; mounted globally via `QProvider` in the
  app layout. `slideInRight`/`fadeIn` keyframes added.

### Verification
- `tests/rls/q-report.test.ts` (6) — grounded project/resource/portfolio reports,
  `AiCallLog` written (metrics only), **tenant isolation** (Riverbank can't see KCB's
  Q logs), missing-project error. **Full suite 134/134.** typecheck + lint clean.
- E2E: opened the drawer as Joyce, generated a portfolio report over the 26 seeded
  RBS projects (real escalations), confirmed the `AiCallLog` row, then purged it.

## Phase B — Riverbank UI + Command Center design (2026-07-14)

Implements the **QUBIT Command Center** prototype (`design_handoff/QUBIT Command
Center.dc.html`) directly (the claude_design MCP needs interactive `/design-login`,
unavailable non-interactively; the prototype is the source of truth). Applied the
ui-ux-pro guidance (token-only, WCAG AA, one primary CTA, clear hierarchy).

### Management UI
- **Teams admin** `/admin/teams` — CRUD + members + lead (mirrors departments).
- **Projects index** `/projects` — filterable list, create dialog, opens the project
  slide panel. Riverbank's primary surface (no subsidiary heatmap).
- **Project panel Resources** — allocate people (role + %), assign teams; widened
  project edit (name/description). New APIs: `/api/admin/teams`, `/api/teams`,
  `/api/projects/{id}/members`, `/api/projects/{id}/teams`.
- **People / workload** `/people` — everyone + allocations + over-allocation.
- **MVP nav**: Dashboard · Projects · Teams · People · Admin (role-gated).
- Themed admin/table surfaces (`bg-white` → `bg-card`) so they respect dark/light.

### Command Center dashboard (`/dashboard`, redesigned)
- Role-aware **briefing hero** (Super Admin / Executive / Project Manager), brand
  radial glow, **SVG health ring** (score as HTML overlay), 3 briefing action cards.
- **KPI strip** (Projects / On track / At risk / Overdue / Planning / People),
  severity-sorted **project cards** (status pill + brand progress + resource count,
  open the panel), and **rails**: Escalations & risks, Upcoming milestones, Workload.
- Admin quick-links for Super Admins. All from live tenant data (`listProjects`,
  `getEscalations`, `getUpcomingMilestones`, `listWorkload`), tenant-scoped.

### Verification
- typecheck + lint clean · **full suite 128/128** · both themes screenshotted
  (Riverbank red, AA) with the 26 seeded RBS projects, escalations rail populated.

## Phase A — Data model + onboarding pipeline (2026-07-14)

### Schema (additive migration `20260714072108_mvp1_teams_resources`)
- New models: `Team`, `TeamMember`, `ProjectMember` (person→project allocation with
  role + `allocationPct`), `ProjectTeam` (teams assigned to a project). Added
  `Project.leadUserId` (real project lead) + back-relations on `Tenant`/`User`/`Project`.
- RLS on all four new tables (`prisma/rls.sql` + migration block, 4/4 policies
  verified); `down.sql`; seed `resetTenant` clears them.

### Server (audited, RLS-scoped — mirror `departments.ts`)
- `src/server/teams.ts` — `listTeams`, `getTeam`, `createTeam`, `updateTeam`,
  `deleteTeam` (+ membership replace); unique team name per tenant.
- `src/server/resources.ts` — `listProjectMembers`, `setProjectMember` (upsert),
  `removeProjectMember`, `setProjectTeams`/`listProjectTeams`, `listUserAllocations`
  (workload feed for the copilot).
- `src/server/projects.ts` — widened `UpdateProjectInput`/`updateProject` to also
  edit **name, description, and lead** (`leadUserId`), validated + audited.

### Onboarding — `scripts/import-riverbank.ts`
- Idempotent CSV importer (dry-run default, `--execute`, `--dir`, `--tenant`) for
  departments / people / teams / projects / allocations. Runs under one Riverbank
  `withTenant` (RLS). New users get a random temp password, written only to
  `import/import-report.json` (git-ignored) for secure hand-off; recommend reset + MFA.
- `/import/` added to `.gitignore` (real PII never committed).

### Verification
- `tests/rls/teams-resources.test.ts` (6) — team CRUD + members, allocation upsert +
  workload, project-team assignment, widened project update, tenant isolation, unique
  team name. **Full suite 128/128.**
- Import smoke: executed synthetic CSVs → created 3 depts / 3 users / 1 team / 2
  projects / 3 allocations; re-run idempotent (all skipped); report git-ignored; then
  purged. typecheck + lint clean.

### Next (Phase B)
Riverbank project/team/people UI: projects index (replace the `/portfolios`
ComingSoon stub), project-panel resources + teams editor, `/admin/teams`, a people/
workload view, and MVP nav (Dashboard · Projects · Teams · People · Admin · Ask Q).

---

## Reports centre — exportable & shareable weekly/monthly reports

Executives & project managers can export **per-project** (weekly/monthly) and
**per-person** reports; every user can export **their own** work & workload. Reports
are **downloadable** (`.md`, print-ready `.html`/PDF) and **shareable** via a
tenant-scoped link.

### Report engine — `src/server/q/report.ts`
- Added `ReportPeriod` (`week` | `month` | `all`) with a `periodWindow()` helper.
  Time-stamped entities now contribute an **"activity this period"** block: tasks
  completed, status updates posted, blockers raised/resolved, new risks & issues —
  scoped to the window (`projectActivity`/`personActivity`). Weekly reads as "what
  happened this week", not a static snapshot.
- `generateReport` returns `title` + `periodLabel` (used for filenames + share cards);
  system prompt frames the report around the period. Deterministic fallback + `AiCallLog`
  metrics unchanged (still key-optional).

### Sharing — `shared_report` table + `src/server/q/shares.ts`
- New `SharedReport` model (migration `20260715120000_reports_shared_report` +
  `down.sql`, RLS appended to `prisma/rls.sql`). Stores the **rendered Markdown at
  publish time**, so a link is a stable point-in-time snapshot.
- `createShare` (audited, 32-byte base64url token — never the row id) / `getShareByToken`.
  Links resolve **only for a signed-in colleague in the same tenant** (view lives under
  the authenticated `(app)` group + RLS) — never a public cross-tenant leak.

### Access — `src/server/q/access.ts` + RBAC
- `canAccessReport(ctx, type, targetId)`: own reports for everyone; project / portfolio /
  delivery / **another person** require `reports:read`. Granted `reports:read` to
  `ProjectManager` (already on PortfolioManager, Executive, Viewer, SystemAdmin).
- Enforced in `POST /api/q/report` (now accepts `period`) and `POST /api/q/report/share`.

### UI
- `/reports` — builder (report type + target picker + Weekly/Monthly) → live preview with
  **Markdown / HTML·PDF / Copy / Share** toolbar; share bar shows the link + audience.
  Managers see project/person/portfolio/delivery; everyone sees My work / My workload.
- `/reports/s/[token]` — read-only shared view (title, author, date, downloads).
- `src/lib/report-export.ts` — dependency-free Markdown→HTML (self-contained, print-ready)
  + `.md`/`.html` blob download. `Reports` nav pill added; Q drawer chips now gated on
  `reports:read` (with a link to the reports centre).

### Verification
- `tests/rls/reports-share.test.ts` (5) — weekly/monthly period + activity, share
  round-trip, **shared-report tenant isolation (RLS)**, per-type access matrix.
  **Full suite 176/176.** typecheck + lint clean. Screenshotted both tenant themes
  (Riverbank red, KCB green): builder, generated report, share link, shared view; demo
  share row purged.

---

## Q AI provider — internal OpenAI-compatible box (qwen3-14b)

Switched Q from the Anthropic SDK to Riverbank's **internal, OpenAI-compatible** agentic
box (`POST {Q_AI_BASE_URL}/chat/completions`, bearer auth, model `qwen3-14b`). Tenant data
now stays in-house rather than going to an external provider.

### Provider — `src/server/q/llm.ts` (new, no new dependency — raw `fetch`)
- `llmChat({system, messages, tools, maxTokens})` → normalised `{text, toolCalls,
  inputTokens, outputTokens}`; maps the OpenAI wire shape (`choices[].message`,
  `usage.prompt_tokens`). `llmEnabled()` / `llmModel()`. 90s timeout via `AbortController`;
  strips `<think>…</think>` reasoning; HTTP errors surface as `LlmError` **without leaking
  the response body** (which could echo the request/headers).
- Configured only via env: `Q_AI_BASE_URL`, `Q_AI_API_KEY`, `Q_AI_MODEL` (git-ignored
  `.env`; templates updated; never committed).

### Call sites re-pointed at the provider
- `report.ts` (reports centre), `draft-brd.ts`, `project-tasks.ts::generatePlan` (text-only
  — the text model can't read PDFs natively, so PDF-only input falls back to the mock),
  and `agent.ts` (agentic chat) — **ported from Anthropic tool-use blocks to OpenAI
  function-calling** (`tool_calls` / `role:"tool"` messages). All keep their deterministic /
  mock fallback, so every feature still works with no provider. `mockEnabled()` now gates on
  `llmEnabled()`; `AiCallLog.model` logs the configured model.

### Verification
- `tests/unit/q-llm.test.ts` (4) — pins the wire contract via a mocked `fetch`: request
  shape + auth header, reply/usage parsing, `<think>` stripping, tool-call surfacing, and
  `LlmError` on HTTP 5xx. `tests/unit/setup.ts` now strips `Q_AI_*` so **no suite can hit
  the live box** (hermetic even once a real key sits in `.env`). **Full suite 180/180.**
  typecheck + lint clean; dev server reboots clean; `/reports` generates end-to-end.
- Note: `@anthropic-ai/sdk` is now unused (left in `package.json`; optional removal).

---

## Fix — select dropdowns showed raw IDs; test suite hermeticity

**Reported:** inviting a user "doesn't work" — picking a project showed a UUID and felt broken.

**Root cause:** Base UI `Select.Value` renders the raw `value` unless the `Select.Root` is
given an `items` map (value→label). Selects whose values are human-readable enums
(`"High"`, `"Planning"`) looked fine; selects whose values are **opaque IDs** (project,
team, org unit, lead, assignee, owner) rendered UUIDs / the `"none"` sentinel. No dialog
actually closed — the flow works (invite returns 201) — but the gibberish read as broken.

- Added `items` maps to every ID-valued Base UI select: invite wizard (org unit / team /
  project), team lead, department (parent / org unit / head), user (department / manager),
  new-project programme, project resources (person), task assignee + status, risk & issue
  owner. Native `<select>` surfaces (ClickUp, reports centre) already render option labels.
- Verified in-app: invite shows "Anchor FAL (RBS-24)" / "No team"; team lead shows
  "Joyce Okore" — labels, not IDs; dialogs stay open.

**Also fixed (surfaced by adding a real `Q_AI_API_KEY` to `.env`):** the DB-backed test
suite began making real calls to the AI box (slow, non-deterministic). Prisma auto-loads
`.env` via dotenv at import time, *after* setupFiles/`test.env` run, repopulating the key.
Fixed with a global `beforeAll` in `tests/unit/setup.ts` (runs after imports) that blanks
`Q_AI_*` / `ANTHROPIC_API_KEY`, so every suite takes the offline path. **Full suite 180/180,
~19s** (was 80s with network stalls). typecheck + lint clean.

---

## Design elevation v3 — foundation + Dashboard (milestone 1)

Implemented the "QUBIT App v3" design handoff as reviewable milestones. This first one
installs the v3 design system app-wide and reskins the flagship Dashboard. All existing
wiring (auth, RLS, data, reports/Q) and per-tenant theming (Riverbank red / KCB green) are
preserved — v3 is an *elevation* of the existing Command Center token system, not a rebuild.

### Foundation (global)
- **Type system:** Archivo (headings/wordmark), Instrument Sans (body), IBM Plex Mono
  (labels/codes/metrics) via `next/font` → `--font-heading`/`--font-sans`/`--font-mono`.
- **Palette (`globals.css`, light + dark):** warm-paper surfaces (`--qbg` #f1efe9 / #151110),
  glassmorphism card tokens (`--cardbg`/`--cardbd`/`--glassblur`/`--insethl`/`--cardsh`),
  hairline/wash scale (`--hair`/`--hair2`/`--wash`/`--wash2`), stage-gate cells
  (`--stD/stA/stL/stP`), `--scrim`, and a tenant-tinted ambient triad (`--amb1` = brand,
  `--amb2/amb3` = fixed QUBIT navy/green). New motion: `rise`, `arcIn`, `drawerIn`,
  `scrimIn`, `drift1/2/3`.
- **Ambient field** (`ambient-field.tsx`): three slow-drifting radial-gradient blobs behind
  the shell (fixed, pointer-events-none, reduced-motion aware); mounted in the `(app)` layout
  with content layered above (`z-[1]`).
- **Topbar:** Archivo wordmark + blur/saturate bump; the navy→green→brand gradient comes
  straight from the `--topbar` token (flips per tenant).

### Dashboard (`src/app/(app)/dashboard/page.tsx`)
Rewritten to the v3 command-center layout, fully on live tenant data:
- Group-overview strip (mono date + ticking `LiveClock` + LIVE pulse).
- Glass briefing hero: role/tenant tag, Archivo greeting, attention summary + links, an
  attention list of the worst-status projects, and a 138px SVG **health ring** (arc animates
  in) + status bar (on / risk / plan).
- KPI strip (single glass card, six divided cells → Projects / On track / At risk / Overdue
  / Planning / People).
- **Delivery ledger:** grouped (Needs attention / On track / Planning) with an 8-cell
  stage-gate strip derived from progress + status, code, name, progress bar, status pill and
  member count; rows deep-link to `/projects/{id}`.
- Signals / Milestones / Workload rails.

### Verification
- typecheck + lint (per-file) clean; **full suite 180/180**. Screenshotted Riverbank
  (light + dark) and KCB (light) — brand health ring, accents and gradient all flip per
  tenant. Old `command/health-ring` + `command/project-cards` are now orphaned (left in place).

### Next milestones (remaining v3 screens)
Projects, My Tasks, Project Workspace (stage-gate rail + board + gate slide-panel), Reports
centre, Admin (Users/Roles/Audit/Depts), Login elevation, and the Q drawer — each as its own
reviewable pass.

## Design elevation v3 — Projects (milestone 2)

- Reskinned `src/app/(app)/projects/` to the v3 language: `PORTFOLIO / {tenant}` eyebrow,
  Archivo title, brand "New project" pill; a filter bar with a glass search + status **chips**
  (All + each present status, with live counts) replacing the dropdown; and the glass
  **gate-table** — 8-cell stage-gate strip, code, name/subline, progress bar, status pill,
  team count, chevron — sorted worst-status-first. Rows still open the project slide-panel.
- Extracted the shared gate/status logic to `src/lib/project-view.ts`
  (`gateCells` / `statusMeta` / `projectRank` / `statusBarTok`) and refactored the Dashboard
  to consume it (DRY across both surfaces).
- Page now fetches per-project member counts (same groupBy as the dashboard). New-project
  dialog carries the v3 pill + `items` labels on its selects.
- typecheck + lint clean; **suite 180/180**; screenshotted Riverbank light + dark.

### Next v3 milestones
My Tasks, Project Workspace (stage-gate rail + board + gate slide-panel), Reports centre,
Admin (Users/Roles/Audit/Depts), Login elevation, and the Q drawer.

## Design elevation v3 — My Tasks (milestone 3)

- Reskinned `src/app/(app)/my-tasks/` to v3: `MEMBER VIEW / {name}` eyebrow, Archivo title,
  a **focus queue** of the three most-urgent open tasks (glass cards: code + due, title,
  Done + "Open project →"), then glass buckets — Overdue · Due this week · Open · Recently
  completed — each row with a real completion **checkbox toggle**.
- Now interactive (split into a client component): toggling a task optimistically flips its
  status and PATCHes `/api/tasks/[id]` (reverts on failure); "Open project" opens the project
  slide-panel. Urgency-then-priority ordering drives both the focus queue and buckets.
- typecheck + lint clean; **suite 180/180**. Verified with 5 temporary demo tasks (overdue /
  due-this-week / open / completed) assigned to Joyce, screenshotted, then purged.

### Next v3 milestones
Project Workspace (stage-gate rail + board + gate slide-panel), Reports centre,
Admin (Users/Roles/Audit/Depts), Login elevation, and the Q drawer.

## Design elevation v3 — Project Workspace (milestone 4)

- Elevated `components/workspace/project-workspace.tsx` to v3 **in place** — kept every
  functional tab (Overview/Board/Documents/Deadlines/Team/Integrations, all wired to live
  data) rather than replacing them with the mock's gate-only board (per the handoff README:
  "don't copy the prototype's internal structure unless it fits").
- New: glass hero (mono eyebrow, Archivo name + status chip, description, progress bar +
  "GATE PROGRESS", team avatars, "Ask Q about this project"), the signature **8-gate stage
  rail** derived from live progress + status (passed/active/late/pending; a late/at-risk
  project surfaces its active gate as LATE), v3 pill tabs, and glass tab-content wrappers.
- typecheck + lint clean; **suite 180/180**. Screenshotted RBS-11 (on-track, light) and
  RBS-06 (at-risk, dark → active gate = LATE).
- Note: the hero % uses task-completion progress (`getProjectProgress`), which reads 0 on
  projects with no tasks yet — this differs from the ledger's org-status `avgProgress`. A
  pre-existing two-metric discrepancy; unifying them is a separate change.

### Next v3 milestones
Reports centre, Admin (Users/Roles/Audit/Depts), Login elevation, and the Q drawer.

## Design elevation v3 — Reports centre (milestone 5)

- Reskinned `src/app/(app)/reports/reports-client.tsx` to v3: two-column layout (400px
  builder + preview), "REPORTS CENTRE" eyebrow + Archivo title, a glass builder (report-kind
  buttons, target selects, Weekly/Monthly period chips, brand Generate pill + note), and a
  glass preview (mono-labelled toolbar Markdown / HTML·PDF / Copy / Share, dot-glyph empty
  state, share-link bar, Markdown body). All handlers unchanged — generate, download (.md /
  print-ready .html), copy, and tenant-scoped share all still work.
- typecheck + lint clean; **suite 180/180**; screenshotted Riverbank light + dark (generated
  portfolio report on live data).

### Next v3 milestones
Admin (Users/Roles/Audit/Depts), Login elevation, and the Q drawer.

## Design elevation v3 — Admin (milestone 6)

- Shared `admin/admin-header.tsx` (client): "ADMINISTRATION · IAM V1 · GATED ON IAM:MANAGE"
  eyebrow, Archivo "Admin" title, and v3 chip tabs (Users / Roles / Audit / Departments) with
  the active tab derived from the pathname — one header across all four admin routes.
- **Users** (flagship) reskinned to v3: glass onboarding tiles (fully onboarded + the five
  filter segments), glass directory (avatar, role chips, onboarding square-dots + x/3, last
  active, row actions) and a glass Insights rail. All filter/segment logic unchanged.
- **Roles / Audit / Departments** reskinned to the shared header + glass cards/tables (role
  cards + permission catalogue; audit grid; departments grid with the dotted empty-state).
  All server data + dialogs (New user / New department, row actions) preserved.
- typecheck + lint clean; **suite 180/180**; screenshotted Users (light + dark) and Roles.

### Next v3 milestones
Login elevation and the Q drawer.

## Design elevation v3 — Login + Q drawer (milestone 7, final)

- **Login** (`(auth)/login/login-form.tsx`) rebuilt to the v3 two-column split: a fixed
  navy→green→red brand panel (QUBIT mark, mono eyebrow, Archivo headline, feature tags, trust
  line) + a form panel that keeps all behaviour — email org-detect (recolours the Sign-in
  button per tenant), TOTP, and the demo quick sign-in buttons. Brand panel hides < lg
  (form goes full-width with a mobile wordmark).
- **Q drawer** (`components/q/q-drawer.tsx`) reskinned to the v3 floating glass drawer:
  scrim + `drawerIn`, rounded glass card inset from the edges, mono header (Ask Q / YOUR
  DELIVERY COPILOT), v3 suggestion chips, glass chat bubbles, glass report/picker, and a
  pill composer. All logic (report generation, project picker, agentic chat, Escape/close)
  unchanged.
- typecheck + lint clean; **suite 180/180**; screenshotted login (light + dark) and the Q
  drawer (light home + dark report, powered by the internal qwen box).

### v3 elevation — COMPLETE
Foundation · Dashboard · Projects · My Tasks · Workspace · Reports · Admin · Login · Q drawer.
All on live data, per-tenant theming (Riverbank red / KCB green) preserved, light + dark.

## Cleanups — lint scope, stray data, progress metric

- **`pnpm lint` now meaningful:** added `**/.next/**` (nested build output) and `.claude/**`
  to the eslint ignores. Previously it scanned `.claude/worktrees/qubit-ui/.next/` and threw
  ~637 errors from minified build artifacts. `pnpm lint` now exits clean — confirming the
  whole v3 elevation (and all session work) lints clean.
- **Removed stray test data:** purged the `TEST-LIFECYCLE-01` "Test Lifecycle Project" (a
  leftover from an old test run) from KCB, along with its scoped rows.
- **Unified project progress metric:** the workspace hero + stage-gate rail now use the
  org-status `avgProgress` (same number the dashboard/projects ledger show) instead of
  task-completion progress, which read 0% on projects with no tasks. Dropped the redundant
  `getProjectProgress` fetch + `progressPct` prop. Verified RBS-11 now shows 63% (matching
  the ledger), with the gate rail deriving 5 passed / UAT active / 2 pending.
- Dark-mode hairline contrast bumped (`--hair` 9%→13%, `--hair2` 5.5%→8%) so dividers read
  crisply. typecheck + lint clean; **suite 180/180**.
