# 01 — Vision & Scope

## What ClickUp is

ClickUp is an "everything app for work": a single workspace combining project management, task tracking, documents, whiteboards, team chat, goals, time tracking, dashboards/reporting, forms, and an AI layer (ClickUp Brain) that spans all of it. Its defining ideas:

1. **One hierarchy for everything** — Workspace → Space → Folder → List → Task → Subtask. Every object (doc, chat, whiteboard, dashboard) attaches somewhere in this tree.
2. **Views over structure** — the same tasks render as List, Board, Calendar, Gantt, Timeline, Table, Workload, Mind Map, etc. Views are saved, shared, filterable, and per-location.
3. **Deep customization** — custom statuses per Space/Folder/List, ~15 custom field types, ClickApps (feature toggles per Space).
4. **Work + context together** — Docs, Chat, and Whiteboards live beside tasks and link to them bidirectionally.
5. **Automation + AI** — trigger/condition/action automations, plus AI agents that summarize, rank, draft, and act ("Brain"). QUBIT already has this seed: **Q**.

## Target: feature parity map (full ClickUp scope)

| # | ClickUp module | Scope in QUBIT build | Phase |
|---|---|---|---|
| 1 | Hierarchy (Workspace/Space/Folder/List) | Full | 0–1 |
| 2 | Tasks (subtasks, checklists, dependencies, recurring, multi-assignee, watchers, priorities, tags, milestones) | Full | 1 |
| 3 | Custom statuses & Custom fields (15 types) | Full | 1 |
| 4 | Views: List, Board, Calendar, Table | Full | 2 |
| 5 | Views: Gantt, Timeline, Workload, Everything, Mind Map | Gantt/Timeline/Workload full; Mind Map read-only v1 | 5 |
| 6 | Docs (wiki, nested pages, task embeds, relationships) | Full | 4 |
| 7 | Whiteboards | Canvas + shapes + sticky→task conversion; no realtime multi-cursor v1 | 7 |
| 8 | Chat (channels, DMs, threads, task-from-message) | Full | 4 |
| 9 | Inbox & Notifications | Full | 2 |
| 10 | Automations (triggers/conditions/actions, 100+ combos) | Full engine, curated action set | 5 |
| 11 | Dashboards (widget canvas: charts, tables, calculations) | Full, curated widget set | 5 |
| 12 | Goals & Targets (OKR) | Full | 6 |
| 13 | Sprints (points, velocity, burndown/burnup) | Full | 6 |
| 14 | Time tracking (timer, manual, estimates, timesheets) | Full | 3 |
| 15 | Forms (public forms → tasks) | Full | 6 |
| 16 | AI — "Q Brain" (connected search, summarize, ask, AI fields, autopilot agents, task ranking) | Full, built on existing Q copilot | 7 |
| 17 | Templates, import/export, public API, webhooks, integrations | API + webhooks full; template center v1; import (CSV) | 8 |

## What QUBIT keeps

- **Multi-tenancy** (KCB green / Riverbank red), tenant resolution at sign-in, per-tenant `--brand` theming, dual dark/light theme, WCAG AA tokens.
- **RBAC** (`can()` gates, roles per `docs/07-auth-rbac.md`) — extended with hierarchy-level permissions (see `04-module-specs.md` §16).
- **Q copilot** — becomes the Brain-equivalent AI layer, gaining connected search and agents.
- **Command Center** — becomes a Dashboard built on the new widget engine (a "Home" per user).
- **OrgUnit/Department structure and Super Admin.**

## Explicitly out of scope (v1)

Realtime multi-cursor co-editing (docs/whiteboards use last-write-wins + presence indicators), mobile apps, marketplace-style third-party integration catalogue (webhooks + REST API cover this), email client (Email ClickApp), proofing/annotation on attachments, ClickUp-style pricing/plan gating (all features on for both tenants).

## Success criteria

- Existing PPM data (portfolios/programmes/projects/tasks) fully migrated into the new hierarchy with zero data loss (`07-migration-guide.md`).
- A user can: create Space→Folder→List, add tasks with custom fields, switch List/Board/Calendar/Gantt views, chat about a task, write a linked doc, track time, build an automation, see a dashboard, and ask Q about any of it.
- All tenant-isolation and permission tests pass; AA contrast in both themes; every phase's acceptance checks green.
