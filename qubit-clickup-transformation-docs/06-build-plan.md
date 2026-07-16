# 06 — Build Plan (Claude Code task list)

Work phases in order; each is shippable. Start every phase by re-reading its module specs (`04`) and relevant schema (`03`). **Stop for review at each phase end.** Keep existing PPM routes functional until Phase 8.

## Phase 0 — Foundation
- [x] Prisma: add Hierarchy, StatusGroup/Status, Task core, TaskAssignee/Watcher/Tag, Activity models (additive migration).
- [x] `src/server/hierarchy.ts` (resolveLocation, inheritance resolver), `permissions.ts` (extend `can()` with levels + ancestor resolution), `queue.ts` (pg-boss bootstrap), `realtime.ts` (NOTIFY helper + `/api/v1/events` SSE route).
- [x] Zod schema library `src/server/schemas/`; error envelope helper; `forTenant()` scoped-query helpers.
- [x] Seed: demo Space/Folder/List/tasks per tenant. Tests: tenant isolation (cross-tenant read = 404), inheritance resolution, orderIndex insert.
- ✅ Accept: migrations reversible; seeds render nothing yet but API `GET /hierarchy` returns tree for each tenant only. _(Verified on isolated DB `qubit_shadow`; shared dev DB blocked by drift/collision — see DECISIONS D0.6.)_

## Phase 1 — Hierarchy UI + Tasks core
- [ ] Sidebar spaces tree (create/rename/archive/reorder/context menus), Space settings (ClickApps, statuses), breadcrumbs, URL scheme.
- [ ] Status editor; tags; task CRUD API; **Task panel** (SlidePanel) with: name, status, assignees, dates, priority, tags, description (TipTap), checklists, subtasks, dependencies (cycle detect), attachments (presigned), comments (threaded, reactions, assigned+resolve), activity tab.
- [ ] Custom fields: definitions manager + all field-type components + values API. Recurring tasks worker. Quick-create with smart parse. Bulk toolbar.
- ✅ Accept: create space→list→task with 5 field types; subtask + dependency + checklist round-trip; comment mention notifies (log only); recurring task clones on completion; all mutations emit Activity; both tenants, both themes AA.

## Phase 2 — Views engine (List, Board, Calendar, Table) + Inbox
- [ ] `queryTasks()` compiler + keyset pagination; View model CRUD; view bar (filters/group/sort/fields/Me mode/save/pin).
- [ ] ListView (inline edit, group drag, aggregates), BoardView (dnd optimistic, column mgmt), CalendarView (drag reschedule, unscheduled tray, ICS feed), TableView (keyboard nav, CSV export).
- [ ] Notification worker (dedupe/batch), Inbox page (Important/Other, done/snooze), SSE badge, per-user prefs, Everything view.
- ✅ Accept: same filter set renders identically across 4 views; board drag persists + survives refresh via SSE on second client; inbox dedupes rapid edits; view share token renders public read-only page.

## Phase 3 — Time tracking
- [ ] TimeEntry API + one-running-timer rule; topbar timer; task panel tracked-vs-estimate; timesheet week grid; report endpoint + CSV.
- ✅ Accept: timer survives navigation; concurrent start rejected; report sums match entries.

## Phase 4 — Docs + Chat
- [ ] Shared TipTap editor package (`components/editor/`) with mentions, task chips, slash menu — refactor task description/comments onto it.
- [ ] Docs: hub, nested pages tree, editor, backlinks, embed saved views, share/export MD; version-conflict toast.
- [ ] Chat: channels/DMs/location channels, threads, reactions, message→task, unread + prefs, SSE live, typing indicator, `@Q` answer.
- ✅ Accept: doc page with embedded live view + task chip reflecting status change; chat message converts to task with backlink; two clients see each other's messages < 2s; permission-hidden channel invisible.

## Phase 5 — Gantt/Timeline/Workload + Automations + Dashboards
- [ ] GanttView (drag move/resize, dependency arrows, critical path, zoom), TimelineView, WorkloadView (capacities).
- [ ] Automation engine (event bus → worker → conditions → actions, loop guard, run log), builder UI, natural-language draft endpoint, schedule trigger.
- [ ] Dashboard grid + widget library (number, bar/pie/line, battery, task list, time report, text) + `GET /widgets/{id}/data`; rebuild **Command Center as Home dashboard** using widgets (briefing hero stays bespoke).
- ✅ Accept: dependency drag creates arrow + blocks status automation fires; automation run log shows diff; loop guard triggers at depth 3; dashboard live-updates on task change; Home preserves Command Center design.

## Phase 6 — Goals, Sprints, Forms
- [ ] Goals hub + targets (incl. task-linked live progress) + dashboard widget.
- [ ] Sprints ClickApp: sprint lists, points, start/complete + rollover, nightly snapshot job, burndown/velocity widgets.
- [ ] Form builder + public submit route (rate-limit, captcha option) + `form_submitted` trigger.
- ✅ Accept: completing linked tasks moves goal %; burndown matches snapshots; anonymous form submission creates task and fires automation.

## Phase 7 — Whiteboards + Q Brain
- [ ] Whiteboard canvas (shapes/sticky/text/connectors/task cards, convert sticky→task), version-checked save, presence, doc embed.
- [ ] Q Brain: SearchIndex worker + `⌘K` global search; Ask mode w/ citations; summarize endpoints (task/doc/channel/standup); AI custom fields; `ai.agent` automation action (scoped tools, logged); context chips in Q drawer; AiCallLog + budget guard.
- ✅ Accept: sticky→task stays live on board; search respects permissions (private list tasks absent for outsider); agent action visible in Activity as "Q (agent)"; budget exhaustion degrades gracefully.

## Phase 8 — Migration, Templates, Public API, Webhooks, Hardening
- [ ] Run PPM migration per `07-migration-guide.md` (script + dry-run + report); redirect legacy routes; retire legacy tables (rename `_legacy`, drop next release).
- [ ] Template center; CSV import wizard; ApiToken mgmt UI + scope enforcement; webhooks (HMAC, retries, auto-disable); audit log UI.
- [ ] Hardening: rate limits on public routes, permission test matrix (role × level × object), load test views on 50k-task list, accessibility sweep (keyboard: Esc/focus traps/rings), token-only color lint, `AuditLog` coverage.
- ✅ Accept: migration dry-run report clean on staging copy; zero orphaned tasks; legacy URLs 301; API docs page renders; all acceptance checks from prior phases re-run green.

## Working agreements for Claude Code
- One phase per session; begin by reading the phase's spec sections; end by running tests + updating `CHANGELOG-transformation.md`.
- Never edit generated Prisma client; never bypass `forTenant()`; never hardcode hex.
- Write tests alongside: unit (server helpers), integration (API + permissions), component (views render given fixture page).
- If a spec is ambiguous, prefer ClickUp's observable behavior, note the decision in `DECISIONS.md`, continue.
