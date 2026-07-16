# 04 — Module Specifications

Functional spec per module. UI follows the QUBIT design system (`docs/08-design-system.md`, Command Center handoff tokens): dark/light themes, per-tenant `--brand`, SlidePanel pattern, pill buttons, fadeUp entrances, AA contrast.

## 1. Hierarchy & Navigation

- Left sidebar (replaces/extends current nav): Home, Inbox, Docs, Dashboards, Goals, Chat, Whiteboards, then **Spaces** tree (Space → Folder → List) with expand/collapse, drag-reorder, right-click context menus (rename, color/icon, archive, duplicate, add List/Folder, sharing, settings).
- Space creation modal: name, icon+color (token palette), private toggle, ClickApps toggles, default statuses (pick a StatusGroup template: "To Do/In Progress/Done", "Kanban", "Scrum", custom).
- Everything view at workspace root: all tasks across spaces the user can see.
- Breadcrumbs on every location page: Space / Folder / List; each segment navigable; task panel shows full path.
- URL scheme: `/s/{spaceId}`, `/s/{spaceId}/f/{folderId}`, `/s/{spaceId}/l/{listId}/v/{viewId}`, `/t/{taskSeq}` (task deep-link opens panel over its list).

## 2. Tasks

- **Task panel** (SlidePanel, 640px, route-addressable): name (inline edit), status pill (dropdown walks the status group), assignees (multi, avatar stack), watchers, dates (start/due, natural-language input "next fri"), priority flag (4 levels, colored), tags, time estimate + tracked, sprint points (if ClickApp on), milestone toggle (diamond icon), custom fields section, description (block editor), checklists (add/assign/reorder/progress bar), subtasks (inline list, promote/demote), dependencies (blocking/waiting-on picker with cycle detection), attachments (drag-drop, gallery), relationships (linked tasks/docs), activity tab (from `Activity`), comments thread (threaded, reactions, assigned comments with resolve).
- Multi-assignee behavior: task appears in each assignee's My Tasks; "unassigned" filterable.
- **Recurring tasks**: RRULE editor (daily/weekly/monthly/custom); on completion (or schedule), worker clones task per recurrence config (statuses reset, checklists reset optional).
- Task templates: save any task as template; insert from template.
- Bulk action toolbar (multi-select in any view): status, assignee, dates, priority, tags, move, duplicate, delete.
- Quick-create: `Q`-style global "+" and per-group inline add; smart parse "Fix login bug @jane #urgent tomorrow" → assignee/tag/due.

## 3. Custom Statuses & Fields

- Status editor per Space (or override per Folder/List): groups OPEN/ACTIVE/DONE/CLOSED, drag-reorder, semantic color tokens, rename with migration (tasks keep status by id).
- Custom fields manager per location; 18 types (see schema). Field creation: name, type, config, required. Values validated by Zod per type. FORMULA fields: safe expression evaluator (custom parser — no `eval`), reference other fields, computed server-side. AI fields: prompt template + source (task content), computed lazily, cached, refresh button.
- Fields inherited downward; List can hide inherited fields.

## 4. Views Engine

Shared across all view types:
- View bar: view tabs (+ add view), filter builder (field/op/value rows, AND/OR groups), group-by, sort, "Me mode", subtask display mode (collapsed/expanded/flat), field visibility, search-in-view, save/save-as, pin, share (public link via `shareToken`).
- Server: `queryTasks(viewConfig, cursor)` compiles filters to Prisma, returns normalized page `{ tasks[], groups[], fieldDefs[], statuses[] }`; keyset pagination; group-level counts.

Per type:
- **List**: grouped rows (by status default), inline edit of every visible column, drag between groups (sets group value), collapse groups, column resize, footer aggregates (sum/avg for number fields).
- **Board**: columns = group-by value (status default), WIP count per column, drag cards (optimistic), card layout: name, seq, assignees, due, priority, tags, custom field chips; column add = create status; swimlanes (secondary group) v1.1.
- **Calendar**: month/week/day; tasks by due date (or date-range spanning bars); drag to reschedule; unscheduled tray on the right; sync-feed URL (ICS) read-only.
- **Table**: dense spreadsheet mode — every field a column, keyboard navigation, copy/paste, CSV export.
- **Gantt**: time axis (day/week/month zoom), bars from start→due, drag to move/resize, dependency arrows (draw by dragging handles; honors dependency types), critical path toggle, milestones as diamonds, expand subtasks, weekend shading, today line.
- **Timeline**: like Gantt but grouped rows (by assignee/list), single row per group, no dependencies.
- **Workload**: per-assignee rows over week/2-week/month; capacity per user (hours/day, default 8, editable); bars colored by utilization (semantic tokens: under/at/over); tasks weight = time estimate (fallback: count or points); click cell → task drawer.
- **Mind Map** (v1 read-only): hierarchy radial/tree layout of Space→Folder→List→Task; pan/zoom.

## 5. Docs

- Docs hub page (all docs, filter by location/creator) + docs attached in hierarchy tree.
- Doc = nested pages (sidebar tree), TipTap block editor: headings, toggle lists, tables, code blocks, images, callouts, dividers, columns v1.1; slash-command menu; `@mention` (notifies), `@task` inline task chip (live status), embed views (a saved view rendered read-only inside the doc).
- Relationships panel: docs linked to tasks/locations; backlinks automatic.
- Sharing: private → location-visible → public via token; export Markdown/PDF.
- Presence: avatars of current viewers; last-write-wins per page save with version warning toast on conflict (no CRDT in v1).

## 6. Chat

- Channels (per team/topic), auto **location channels** (every Space/Folder/List gets an optional linked channel), DMs, task threads.
- Message = block editor light (text, mentions, links, attachments, emoji); reactions; threads; edit/delete (soft); unread markers + per-channel notification prefs.
- **Message → task**: hover action creates task (message content → description, backlink chip on message, `createdTaskId`).
- "FollowUps": assigned comments & mentions from chat aggregate into Inbox.
- SSE-driven live updates; optimistic send; typing indicator (ephemeral realtime event, not persisted).
- Q in chat: `@Q` mention triggers AI answer in-thread with workspace context (tenant-scoped).

## 7. Whiteboards

- Canvas (SVG/DOM hybrid): pan/zoom, shapes (rect/ellipse/diamond), sticky notes, text, freehand (v1.1), connectors (elbow/straight, arrowheads), images, **task cards** (live task chips) — drag a sticky → "Convert to task" (choose list) and the sticky becomes a live task card.
- Toolbar: select/hand/shape/sticky/text/connector; color from token palette; z-order; multi-select, group-move; snap-to-grid.
- Persistence: whole scene JSON, save debounced 2s, `version` optimistic-concurrency check; presence avatars; no multi-cursor v1.
- Attachable to hierarchy; embeddable in Docs read-only.

## 8. Inbox & Notifications

- Inbox page: Important (assigned, mentions, assigned comments) / Other (watcher updates, due soon, automation, Q nudges); group by task; actions: mark done (read), snooze (until tomorrow morning / next week / custom), open task panel inline.
- Notification generation in worker from `Activity` (dedupe: batch same-actor-same-task within 2 min); per-user prefs (in-app/email per reason); daily digest email option.
- Badge counts realtime via SSE topic `inbox:user:{id}`.
- Q proactive nudges (existing design) post into Inbox + toast.

## 9. Automations

- Builder UI (per location, gated `automation:manage`): When [trigger] + If [conditions] + Then [actions ordered]. Natural-language box: describe rule → Q drafts trigger/conditions/actions for review (never auto-activates).
- Triggers: task created / status changes / assignee added / due date arrives / priority changes / custom field changes / task moved to list / comment added / checklist resolved / form submitted / schedule (cron).
- Conditions: any task field/custom field with type-aware operators.
- Actions: set status/assignee/priority/dates/fields/tags; move/duplicate task; create task/subtask (template); add comment; send chat message; send webhook; send email (internal template); **ai.agent** (prompt + safe toolset: read task, comment, set fields).
- Run log per automation (last 50 runs, status, diff); loop guard `automationDepth ≤ 3`; per-tenant hourly rate cap.

## 10. Dashboards

- Dashboard = grid canvas (react-grid-layout pattern; 12 cols), widget library drawer, per-widget config panel (data source = location(s) + filters, reuse the filter builder).
- Widgets: number/calculation (aggregate of field), bar/pie/line (group-by breakdowns; time series from Activity for cumulative flow/burnup), battery (% done), task list (embedded mini view), time report (per user/task from TimeEntry), workload, sprint burndown/velocity, goal progress, text/markdown, embed (iframe allowlist).
- Chart lib: lightweight (recharts or ECharts) themed via tokens. Auto-refresh 60s + realtime invalidation.
- **Command Center becomes a system dashboard** per user ("Home"): briefing hero + KPI widgets re-implemented as widgets (Phase 5).

## 11. Goals & Targets

- Goals hub: folders of goals; goal page: description, owner, due date, targets list with progress roll-up (weighted avg).
- Target types: number, money, true/false, **task** (link tasks/lists — progress = % done, live).
- Goal progress widget on dashboards; Q can summarize goal status.

## 12. Sprints

- Sprint ClickApp per Space: sprint folder auto-created; sprints are special Lists with dates; backlog list.
- Sprint points field enabled; velocity = avg completed points last N sprints; burndown (points remaining vs ideal line) and burnup charts from `Activity` snapshots (nightly job records remaining points).
- Sprint actions: start/complete sprint; on complete, unfinished tasks roll to next sprint (configurable: backlog).

## 13. Time Tracking

- Global timer in topbar (one running entry per user, enforced server-side); start from task panel or list row hover.
- Manual entries (date, duration, note, billable flag); edit/delete own entries; `time:manage_others` for leads.
- Task shows tracked vs estimate (progress bar, over = semantic warn token); rollup to subtasks.
- Timesheets page: my week grid (tasks × days), submit for review v1.1; time report widget for dashboards; CSV export.

## 14. Forms

- Form builder per List: drag fields (name, description, due, priority, assignee?, any custom field), required toggles, labels/help text, logic (show field if…) v1.1.
- Public route `/f/{shareToken}` — unauthenticated, rate-limited, captcha option, file upload (allowlist), thank-you message; submission → task in target list (+ `form_submitted` trigger).
- Submissions tab: list of created tasks.

## 15. Q Brain (AI layer)

Extends the existing Q copilot drawer:
- **Connected search**: global `⌘K` search (FTS across tasks/docs/chat/comments/files-metadata) with type filters; "Ask" mode = retrieval → answer with linked citations (tenant-scoped, permission-filtered results only).
- **Summarize**: task thread summary, doc TL;DR, channel catch-up ("what did I miss"), standup generator (my activity → draft).
- **My Tasks ranking**: existing ranked list with "Why?" factors — keep as spec'd in Command Center handoff.
- **AI custom fields**: per-task computed values (e.g., "summary", "sentiment", "next step").
- **Autopilot agents**: automation action; scoped tools (read task/comments, write comment, set status/fields); every agent action logged to Activity as actor "Q (agent)" and visible in run log.
- **Q chat everywhere**: drawer keeps canned intents; add context chips (this task / this list / this doc).
- Cost controls: `AiCallLog`, per-tenant daily token budget env-configured, graceful "budget reached" state.

## 16. Permissions & Sharing

- Levels: **Full** (manage + delete + share), **Edit**, **Comment**, **View**. Resolution: object override → nearest ancestor override → role default (`docs/07-auth-rbac.md` roles map to defaults) → deny.
- Private spaces/lists/docs/dashboards: visible only to invited members; sidebar hides them from others.
- Public sharing: per-object `shareToken` (views, docs, dashboards, forms), read-only, revocable, optional expiry; server renders a stripped public layout (no nav, no PII beyond content).
- Guests v1.1: external users limited to explicitly shared objects.
- Admin: permission overrides UI in object "Sharing & Permissions" dialog; audit log entries for every change.

## 17. Templates, Import/Export, API & Webhooks

- Template center: save Space/Folder/List/Task/Doc/View as tenant template; instantiate with options (copy tasks? dates shift?).
- Import: CSV → tasks (column mapping wizard, custom-field creation on the fly). Export: CSV per view, Markdown/PDF per doc.
- Public REST API `/api/v1/*` with `ApiToken` (scopes), documented in `05-api-spec.md`; personal token management page.
- Webhooks: per-tenant endpoints, event allowlist (task.*, comment.*, form.*), HMAC signature, retry ×5 exponential, auto-disable after 20 consecutive failures.
