# MVP1 Brief — Riverbank: Project & Resource Reporting with the Q Copilot

**Goal:** By end of week, Riverbank runs on QUBIT with **real** people, teams,
resources and projects onboarded, and a **Q copilot** that produces reports on
(1) each project + its resources, (2) each person's workload, and (3) a high-level
portfolio roll-up. Riverbank has **no subsidiaries** — only projects, teams, and an
org hierarchy.

**Foundation:** the existing PPM app (not the ClickUp Spaces surface). Dev DB
`qubit_clickup`. Every table is tenant-scoped with Postgres RLS; every mutation is
audited; secrets via env only; **no real PII in code/seeds/tests** (real data lives
only in operator CSVs + the database). Plan of record:
`~/.claude/plans/glistening-forging-rivest.md`.

Legend: ✅ done · 🟡 partial · ⬜ not started.

---

## 1. Module readiness matrix

### Foundation & data (must be ready before reporting)
| Module | Purpose for reporting | Status | Where |
|---|---|---|---|
| Tenant isolation (RLS + `withTenant`/`forTenant`) | Every report is Riverbank-only, safely | ✅ | `src/lib/tenant.ts`, `prisma/rls.sql` |
| Audit log | Trace who changed what | ✅ | `src/lib/audit.ts`, `audit_log` |
| RBAC (`can()`) | Gate report/API access | ✅ | `src/lib/rbac.ts` |
| **Team / TeamMember** | Team dimension in reports | ✅ | schema + `src/server/teams.ts` |
| **ProjectMember (resource allocation)** | The "resources on a project" + workload data | ✅ | schema + `src/server/resources.ts` |
| **ProjectTeam** | Teams assigned to a project | ✅ | schema + `resources.ts` |
| **Project.leadUserId / widened project edit** | Lead + full project fields | ✅ | `src/server/projects.ts` |
| Migration + RLS for all of the above | — | ✅ | `20260714072108_mvp1_teams_resources` |

### Onboarding (get real data in)
| Module | Purpose | Status | Where |
|---|---|---|---|
| **CSV importer** (people/departments/teams/projects/allocations) | Bulk-load real Riverbank data, idempotent, dry-run | ✅ | `scripts/import-riverbank.ts` |
| Temp-credentials hand-off + PII git-ignore | Secure onboarding, no PII in repo | ✅ | `import/` git-ignored |
| Email invite / self-serve reset | Nicer onboarding than temp passwords | ⬜ (fast-follow) | — |

### Management UI (maintain the data the reports read)
| Module | Purpose | Status | Where |
|---|---|---|---|
| User management (invite/suspend/roles/dept) | Who exists, their roles/org | ✅ (admin sets password) | `admin/users`, `src/server/users.ts` |
| Department org hierarchy | Reporting lines | ✅ | `admin/departments`, `src/server/departments.ts` |
| **Teams admin** (CRUD + members + lead) | Manage teams | ✅ | `admin/teams/*` |
| **Projects index** (list/filter/create) | Riverbank's primary surface | ✅ | `(app)/projects/*` |
| **Project panel — Resources + Teams** | Allocate people (role+%), assign teams | ✅ | `components/panels/project-resources-section.tsx` |
| Project edit (name/description/status/priority/due/budget) | Maintain projects | ✅ | `edit-project-dialog.tsx` |
| **People / workload view** | Per-person allocations + over-allocation | ✅ | `(app)/people/*` |
| MVP nav (Dashboard·Projects·Teams·People·Admin) | Riverbank-focused navigation | ✅ | `layout/nav-pills.tsx` |
| Dark/light theming of admin tables | Consistent look | 🟡 (bg-white→bg-card swap done; broader polish pending) | — |

### Reporting data layer (what Q reads — all tenant-scoped, no LLM)
| Data source | Feeds which report | Status | Where |
|---|---|---|---|
| `getDashboardSummary` (KPIs, RAG counts, budget) | High-level | ✅ | `src/server/dashboard.ts` |
| `getPortfolioCards` / `listProjects` (per-project rollups) | High-level + project | ✅ | `dashboard.ts`, `projects.ts` |
| `getProjectPanelData` (project detail, progress) | Project | ✅ | `projects.ts` |
| `listProjectMembers` / `listProjectTeams` | Project resources | ✅ | `resources.ts` |
| `listUserAllocations` / `listWorkload` | Resource/workload | ✅ | `resources.ts` |
| `listRisks` / `listIssues` / `getEscalations` | Project + high-level risk view | ✅ | `risks.ts`, `issues.ts`, `dashboard.ts` |
| `getUpcomingMilestones` | High-level | ✅ | `dashboard.ts` |

### Q copilot (Phase C — ✅ built)
| Module | Purpose | Status | Where |
|---|---|---|---|
| Claude SDK + `ANTHROPIC_API_KEY` (env) | LLM engine (`claude-opus-4-8`) | ✅ | `@anthropic-ai/sdk` |
| `AiCallLog` model (+ migration/RLS) | Log model/tokens/latency — **no user content** | ✅ | schema + `ai_call_log` |
| **Report engine** (grounded context builders) | Assemble tenant-scoped JSON → Claude, "use only provided data" | ✅ | `src/server/q/report.ts` |
| Report type: **Project** (status + resources + risks/issues) | "Report on this project" | ✅ | report.ts |
| Report type: **Resource** (a person's workload) | "My workload" | ✅ | report.ts |
| Report type: **High-level** (portfolio roll-up) | "Portfolio summary" | ✅ | report.ts |
| **Graceful fallback** (no API key → deterministic report) | Works end-to-end without a key | ✅ | report.ts |
| API `POST /api/q/report` | Serve reports; tenant-scoped; logged | ✅ | `src/app/api/q/report` |
| **Q drawer UI** (report panel, markdown, suggestion chips) | Replaces the placeholder "Ask Q" toast | ✅ | `components/q/*` |
| Streaming via existing SSE / free-form `/api/q/chat` | Nice-to-have | ⬜ (fast-follow) | `api/v1/events` |

### Ops / deployment (required for real users)
| Module | Status |
|---|---|
| Managed Postgres + env secrets (`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `MFA_ENCRYPTION_KEY`) | ⬜ (currently local `qubit_clickup`) |
| Reachable deploy target + domain | ⬜ |
| MFA enabled on privileged accounts (TOTP exists) | 🟡 (available, enforce on onboard) |

---

## 2. What each Q report needs (data contract)

- **Project report** ← project (name/status/priority/dates/budget/progress) +
  `listProjectMembers` (people, roles, %) + `listProjectTeams` + project risks/issues
  + milestones. **All ready.**
- **Resource report** ← `listUserAllocations`/`listWorkload` (projects, roles, %,
  total, over-allocation). **Ready.**
- **High-level report** ← `getDashboardSummary` + per-project rollups +
  `getEscalations` + `getUpcomingMilestones`. **Ready.**

➡️ **The entire reporting data layer is already in place.** The only remaining work
for reporting is the Q copilot itself (Phase C): the Claude wiring, the grounded
report engine over the data above, the `/api/q` endpoints, and the drawer UI.

---

## 3. Readiness checklist to "Q gives project & resource reports"

- [x] Team, resource-allocation, project-team models + RLS + migration
- [x] Server access for teams, resources, workload, project detail
- [x] CSV onboarding (idempotent, PII-safe)
- [x] Projects / Teams / People UI + project-panel resources
- [x] Tenant-scoped reporting data functions (dashboard/projects/resources/risks)
- [x] Anthropic SDK + `ANTHROPIC_API_KEY` in env (server-only; `.env.example`)
- [x] `AiCallLog` model (+ migration + RLS)
- [x] `src/server/q/report.ts` (3 grounded report types + deterministic fallback)
- [x] `POST /api/q/report`
- [x] Q drawer UI (replaces the placeholder Ask Q)
- [ ] Real Riverbank data imported (operator CSVs) — **Phase D**
- [ ] Deployment (managed DB + secrets + domain) for real users — **Phase D**

**Current state:** Phases A + B + **C complete** (data model, onboarding, management
UI, Command Center dashboard, and the Q copilot). Only **Phase D** remains: run the
CSV import with real Riverbank data and deploy (managed Postgres + env secrets +
`ANTHROPIC_API_KEY`). Test suite green (134), typecheck + lint clean.
