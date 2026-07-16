# MVP1 Improvement Notes — UI, Modules, Workflow

**Date:** 2026-07-15 · Based on: full codebase review vs the MVP1 PRD + Platform Overview PDFs, the MVP1 brief, CHANGELOG-mvp1, stakeholder backlog (docs/14), and design-handoff screenshots.

**Where you stand:** the build is ~85% of the PRD and in several areas *ahead* of it (multi-tenancy + RLS, audit, MFA, resource allocation, time tracking, and a real Q agent are built even though the PRD defers them to MVP2). 166/166 tests green, typecheck/lint clean, real LLM wiring done with a smart mock fallback. What remains is a focused set of PRD gaps — mostly around the AI document workflow, approval loop, persona dashboards, and onboarding polish.

---

## 1. Scope alignment first (30 minutes, saves days)

The PRD and the built product disagree in both directions. Decide once, write it in `DECISIONS.md`:

- **Built-but-"MVP2" features** (multi-tenancy, audit, MFA, resource allocation, time tracking, AI call logging): keep them — they're your security posture — but don't let PRD reviewers count them as scope creep. Add one line to the PRD: "MVP1 ships on the QUBIT platform, which already provides these."
- **Role naming**: PRD says Administrator/Executive/Project Manager/Member; code has SystemAdmin/PortfolioManager/ProjectManager/Contributor/Viewer. Map them in `docs/07-auth-rbac.md` and use PRD names in UI copy so demo language matches the document.
- **ClickUp surface (`/s/` routes, spaces/views/automations)**: correctly hidden from nav. Put it behind a feature flag (`NEXT_PUBLIC_SPACES=off`) rather than just unlisted, so a typed URL can't reach an unpolished surface during stakeholder demos.
- **Riverbank org structure is flat (decided 2026-07-15, see DECISIONS.md → DM1.1)**: one organization, departments only — HR, Development, QA, PMO, Executive Office. No org units/regions/branches. The seed currently gives Riverbank `WR`/`CR` region org units (wrong — remove) and zero departments (add). Keep one hidden anchor org unit only because `ProjectOrgStatus.orgUnitId` is non-nullable; hide the "Subsidiaries" sidebar group when a tenant has ≤1 org unit. CEO/CTO/Executives are Executive Office members with Executive roles; Head of QA is QA's `Department.headUserId`; PMs and PMOs sit in the PMO department. Slot this into work item 1 (schema-adjacent day) — it's mostly seed + nav guard, no migration.

---

## 2. Module & feature gaps (prioritised)

### P0 — required to honestly claim the PRD's success criteria

**2.1 AI extraction on document upload (M3) — the advertised differentiator.**
Upload works; plan/task generation works; but the PRD's "AI extracts summary, stakeholders, timeline, risks" step doesn't exist. Add one extraction pass on upload (reuse the existing Claude document-block pipeline in `project-tasks.ts`):
- Output: `{ summary, objectives, scope, deliverables, stakeholders[], timeline: {start?, end?, phases[]}, risks[] }` (Zod-validated).
- Surface as a **review screen** — "Q found this in your BRD" — with per-section Accept buttons that prefill project fields (objective, dates), create Risk rows, and suggest members. Never auto-apply.
- Reuse the mock-mode pattern for keyless demos.

**2.2 Approval workflow for generated plans/tasks (M4/M5).**
PRD: "Managers approve tasks before publication." Today `generatePlan()` creates tasks directly. Add `ProjectTask.approvalStatus` (`Draft | Published`, default Published for manual tasks, Draft for AI-generated), a review table (edit/delete inline, "Approve all", per-phase approve), and exclude Drafts from progress %, dashboards, member views, and Q reports. This is the difference between "AI helps" and "AI floods my board".

**2.3 Persona dashboards (M11 + Dashboards section).**
One role-aware dashboard exists; the PRD demands three distinct experiences. Cheapest honest version, reusing existing widgets:
- **Executive** (`dashboard:read` + read-only roles): strip operational detail — portfolio counts, RAG heatmap, projects at risk, upcoming milestones, critical blockers. No task-level rows. (This also answers the "Group Exco dashboard" item in docs/14.)
- **Manager**: current dashboard + a "My projects" filter default, tasks-by-status bar, open risks/blockers counts, team workload widget (exists in `resources.ts`).
- **Member**: `my-tasks` already matches the PRD member dashboard — just route Members there as their landing page.
Route by primary role after sign-in; keep one codebase with widget composition, not three pages.

**2.4 Milestones need to be first-class (M8).**
Currently attached to `ProjectOrgStatus` with a bare `state` — no project-level list, no overdue/upcoming logic, no AI generation, no edit UI. Do: link milestones to Project (keep org-status link optional), derive `Upcoming | Due soon | Overdue | Completed` from `dueDate` + `state`, add a Milestones tab in the project workspace (create/edit/complete), and generate one milestone per phase-end during plan generation (one line in the existing prompt + insert).

**2.5 Project dates + timeline revisions (M2).**
`Project.dueDate` is missing (PRD requires end date) and "track timeline revisions" isn't modeled. Add `dueDate` to Project, plus a small `TimelineRevision` table (projectId, oldStart/oldDue, newStart/newDue, reason, actorId, createdAt) written whenever dates change; show as a "Timeline history" list in the project panel. Cheap, and it's an explicit PRD line item.

### P1 — makes MVP1 *comfortable* rather than minimal

**2.6 RAG formula should match the PRD definition (M12).**
Health currently derives from org-status worst-status/progress only. The PRD defines RAG by delays **+ risks + blockers + overdue tasks**. Fold in: open critical blockers, high risks, overdue-task count, and progress-vs-elapsed-time (you already built this heuristic in Q mock's "why is X at risk" — promote it to the real health calc in `dashboard.ts` so the dashboard and Q give the same answer). Document the thresholds in `docs/05`.

**2.7 Task dependencies (M5/M6).**
AI prompt already asks for dependencies but there's nowhere to store them. Add `ProjectTask.dependsOnIds String[]` (or a join table), show as chips in the task panel, and block "Completed" with a confirm when a dependency is open. Skip graph visualization for MVP1.

**2.8 Task attachments (M6).**
Not modeled. Lightest fix: allow linking existing `ProjectDocument` rows to a task (`taskId` on document or a join), reusing the upload flow. A dedicated attachment table can wait.

**2.9 Onboarding: invites + password reset (M1).**
Admin-set passwords are fine for the pilot but the PRD lists password reset. Either wire a mailer (Resend/SES — env-based, ~1 day: invite email with expiring token + self-serve reset) or **explicitly de-scope in the PRD** and document the temp-credential procedure. Don't leave it ambiguous. Enforce MFA-on-first-login for Admin/Manager roles either way (flag exists per the brief).

**2.10 Report export.**
Q reports are markdown-only; docs/14 stakeholders already asked for CSV/PDF/PPT. For MVP1: add "Download as PDF" on the three main Q reports (markdown → HTML → print stylesheet is enough; server PDF later) and CSV on the projects index. Defer PPT/Benefit-Realization decks to Phase D as planned.

### P2 — polish, don't gate on these

- Blocker escalation: surface "Critical blockers" as an Executive KPI card + include in `getEscalations`.
- Free-text `ProjectMember.role` → constrain UI to the ten PRD roles (keep the column free-text; validate in Zod + dropdown).
- Budget is a display string ("KES 2.8B") — fine for MVP1; note the money-type migration in Phase C docs so nobody builds math on it.
- CI: tests exist but no pipeline. A single GitHub Action (typecheck, lint, vitest, build) protects the demo week.

---

## 3. UI improvement notes

*(From the design handoff vs implemented state, code review, and the brief's own 🟡 items — worth a screenshot pass of the live app against these.)*

**3.1 Navigation consistency.** Three navigation models exist: the design prototype's topbar pills (Command Center · My Tasks · Portfolios · Admin), the brief's MVP nav (Dashboard · Projects · Teams · People · Admin), and the current sidebar (Portfolios, Projects, Org Units, Admin). Pick the MVP1 set, make Teams and People reachable (they exist as pages), and label the dashboard by persona ("Command Center" for exec/manager). Losing "People" from nav hides the workload story you built.

**3.2 Finish the dark/light polish (brief's 🟡).** The `bg-white→bg-card` sweep was done; do a token-lint pass (grep for raw `bg-white|text-black|#`) across admin tables, dialogs, and the Q drawer, and spot-check AA on status pills and heatmap meta text in light mode — the handoff README warns grey-on-tint fails AA there.

**3.3 Q trust affordances.** Always show data scope + generated-at on every Q answer ("Based on 12 projects, 34 allocations · 15:02"). Keep the "Simulated Q" badge prominent in mock mode — never let stakeholders think canned answers are the LLM. Add a one-click "copy report" and a retry state distinct from budget-exhausted.

**3.4 The AI workflow needs UI seams it currently lacks:** an upload dropzone with kind picker (BRD/Plan/Excel) on the project workspace, a visible "Generate plan" progress state (streaming or staged: extracting → drafting phases → tasks), the extraction review screen (2.1), and the plan approval table (2.2). These four screens *are* the demo — budget most UI time here.

**3.5 Dashboard hero parity.** The prototype's briefing hero (greeting, three attention cards, health ring, "vs last week" delta) is your best stakeholder moment. Ensure the implemented version keeps: number-as-HTML-overlay on the ring, deltas with real week-over-week data (Activity/status history exists to compute it), and links that deep-link to the actual escalation/task.

**3.6 Empty and loading states.** Real Riverbank data lands late (Phase D). Every list (projects, risks, milestones, teams, people, Q drawer) needs an intentional empty state with the primary action ("Upload a BRD to generate your plan"), and skeletons on dashboard cards — first impressions during onboarding will mostly be empty screens.

**3.7 Small but visible:** suspended-row 55% opacity + status pill (per handoff) in admin users; keyboard pass (Esc closes panels/drawer, focus trap in dialogs, visible focus rings — handoff acceptance list); consistent date format (monospace token per design) across tasks/milestones/reports; over-allocation warning color must be the semantic warn token with text, not color-only.

---

## 4. Workflow improvements (PRD's 10-step flow vs today)

| # | PRD step | Today | Fix |
|---|---|---|---|
| 1 | Admin creates users/roles | ✅ admin UI (+CSV) | Add invite email or document temp-cred flow (2.9) |
| 2 | PM creates project | ✅ | Add dueDate at create (2.5) |
| 3 | PM uploads BRD/plan/Excel | ✅ upload | Add dropzone + kind picker in workspace (3.4); Excel path untested — verify or restrict to PDF/text for MVP1 and say so |
| 4 | AI extracts info + plan | 🟡 plan only | Extraction review screen (2.1) |
| 5 | AI derives tasks | ✅ | — |
| 6 | PM reviews & approves | ⬜ | Approval workflow (2.2) — biggest workflow gap |
| 7 | Members execute tasks | ✅ my-tasks + board | Route Members to my-tasks on login (2.3) |
| 8 | System tracks completion/milestones/risks/blockers | 🟡 | Milestones first-class (2.4); RAG formula (2.6) |
| 9 | Dashboards/reports update in real time | ✅ mostly | Week-over-week deltas real (3.5) |
| 10 | Execs monitor via reports + RAG | 🟡 | Executive dashboard variant (2.3) + PDF export (2.10) |

**Demo-day workflow to rehearse end-to-end:** create project → upload BRD → review extraction → approve plan → member completes tasks → RAG shifts → Q project report → exec dashboard. Every P0 above is on this path; nothing else is.

---

## 5. Suggested order (roughly 1.5–2 weeks of focused work)

1. **Days 1–2:** Approval workflow (2.2) + milestones first-class (2.4) + Project.dueDate/revisions (2.5) — schema-adjacent, do together, one migration.
2. **Days 3–4:** Extraction-on-upload + review screen (2.1) + upload/generation UI seams (3.4).
3. **Day 5:** Persona dashboard routing + Executive variant (2.3); nav cleanup (3.1).
4. **Days 6–7:** RAG formula (2.6), dependencies (2.7), attachments-via-documents (2.8).
5. **Day 8:** Onboarding decision — mailer or documented de-scope (2.9); MFA enforcement; feature-flag `/s/` (1).
6. **Days 9–10:** Export (2.10), empty/loading states (3.6), token/AA sweep (3.2), keyboard pass, CI action; rehearse the demo script.

**Definition of "comfortably done":** the 10-step workflow runs end-to-end with no manual DB touch, in both themes, with Q real *and* mock modes; Draft tasks never leak into progress/reports; execs see their own dashboard; tests extended for approval, milestones, revisions, extraction (target ~185+); suite/typecheck/lint green.
