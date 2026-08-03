# 24 — QUBIT Workflow Plan (transcribed from handwritten notes, 2026-08-03)

Faithful transcription of Joyce's notebook pages. Source of truth for the wireframe /
workflow remodel (feeds docs/25+). Light cleanup only; intent preserved.

---

## User: Executive

This user is onboarded by the Super Admin. They log in and set a password. **2-step
verification is optional** for this user.

**Menu (pages) for the Executive user:**
1. Dashboard
2. Portfolio
3. Programme
4. Projects
5. Reports
6. Teams and People

### Dashboard — Executive view
- (i) **AI brief** of any actions needed from the user. The AI brief also shows **urgent
  look-outs**, e.g. a project running behind.
- (ii) **Cards with data** on overall portfolios, projects, programmes.
- The overall cards on the dashboard **link to each page** — e.g. the "IT projects" card
  opens up to show the listed projects on the Projects page.
- (iii) **Portfolio → Project** with its checkpoints, budget, resources, risks,
  milestones, etc. This list should properly **group Programmes and Projects into their
  right Portfolios**. Programmes and portfolios are further categorized into **3:
  Approved, Exploring, Shelved**.
- (iv) **Market rollout heat map** — list portfolio-projects across the different
  subsidiaries implemented, and their statuses.

### Portfolio page — Executive view
- Square cards with the portfolios listed.
- **"Add" button for New Portfolio.**

### Project view page — Executive
- List all projects and, at a glance, see **progress, status, team**.
- **Filters** to categorize by delivery status, e.g. UAT, Prototype…
- **Filters** to categorize by pipeline status, e.g. Approved, Shelved.
- On clicking a project, it opens its **project workspace**.

### Project workspace (view only — Executive) — opens:
- Project Details
- Project Docs
- Budget
- **Summary Report from PM** (board / weekly update)

### Reports page — Executive view
- List all projects, with a **"Generate report" button on each row**, in each project.
- This page allows **export to PDF**, and **all reports allow edits**.

---

## User: Project Manager

**Menu (pages) for the Project Manager user:**
1. Dashboard
2. Portfolio
3. Programme
4. Projects
5. Reports
6. Teams and People

### Dashboard — PM view
_(notes end here — PM dashboard detail to be defined in the remodel)_

---

## Consolidated with this session's decisions (for the remodel)

These notes are the Executive + PM **navigation and page intent**. Combine with the
requirements Joyce gave in chat (2026-08-03), which extend/override where they conflict:

- **Tasks are read-only in QUBIT**, mirrored from **YouTrack**. Nobody authors tasks here
  — not devs/QA/implementors, not PMs. (Supersedes docs/18 §4 "anyone can create a task".)
- **One board per project** — a single project task board showing all users' tasks
  (read-only), not personal boards inside a project.
- **Dev / QA / Implementor in a project can:** view tasks (YouTrack), download docs, send
  reports, edit reports, write queries/concerns. **No task authoring.**
- **PM in a project can:** see all users' tasks on the one project board; update
  **checkpoints** and **market rollout tracking**; generate/edit and **send the project
  report to the Head of PMs**.
- **Reports are generated/edited inside the workspace** — per project / programme /
  portfolio. The standalone reports centre is retired; a thin **"All reports" index**
  remains for the Head of PMs to find + export.
- **Head of PMs can export** project reports, portfolio views, programme views, and
  **resource allocations** (PDF).
- **Reporting chain:** dev/QA/implementor weekly update → nudged to send/edit → PM's
  per-project report → **Head of PMs**. (Exec sees summary reports + dashboards.)
- Pipeline categories confirmed: **Approved · Exploring · Shelved** (portfolios,
  programmes, projects). Delivery status is separate (e.g. Prototype → UAT → …).
- Executive MFA is **optional**; privileged roles require it (docs/23 policy).

**Open point to confirm during wireframing:** the PM dashboard detail (the notes stop at
"Dashboard PM view") — proposed in the wireframe pass as: check-in due status, my projects
(RAG + Δ), action queue, team load.
