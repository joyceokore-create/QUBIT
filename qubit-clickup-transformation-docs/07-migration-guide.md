# 07 — Migration Guide: QUBIT PPM → ClickUp Hierarchy

## Concept mapping

| QUBIT PPM (today) | New model | Notes |
|---|---|---|
| Tenant (KCB / Riverbank) | Workspace (= Tenant, unchanged) | One workspace per tenant; branding as-is |
| Portfolio | **Space** | Space color from portfolio RAG-neutral palette; portfolio metadata → Space settings + custom fields |
| Programme | **Folder** | |
| Project | **List** | Project start/end → List startDate/dueDate; project status → List info fields |
| Legacy Task | **Task** | Status mapped via status-mapping table below; assignee → TaskAssignee; description text → TipTap JSON (single paragraph) |
| RAID items (risks/issues) | Tasks in a "RAID" List per Space, with custom fields (Severity, Type, Owner) | Keeps Q escalation feeds working |
| Milestones | Tasks with `isMilestone = true` | |
| Command Center | Home dashboard (system) | Rebuilt on widget engine (Phase 5) |
| My Tasks (AI-ranked) | Unchanged, reads new Task model | Ranking endpoint swaps data source |
| Q copilot | Q Brain | Same drawer, new capabilities |
| OrgUnit / Department / roles / Super Admin | Unchanged | Role defaults map to permission levels (see 04 §16) |

## Status mapping

Create one StatusGroup per Space from the union of that portfolio's project statuses:

| Legacy | New status | Type |
|---|---|---|
| Planning | Planning (blue token) | OPEN |
| In Progress / On Track | In Progress (brand) | ACTIVE |
| At Risk | At Risk (amber) | ACTIVE |
| Overdue / Blocked | Blocked (red) | ACTIVE |
| Done / Complete | Done (green) | DONE |
| Cancelled | Cancelled (grey) | CLOSED |

RAG reporting derives from status `colorToken` + due dates, so portfolio heatmaps keep working.

## Migration script (`scripts/migrate-ppm.ts`)

1. **Dry run mode default** — produces `migration-report.json`: counts per entity, unmapped statuses, orphans, warnings. `--execute` to write.
2. Per tenant, inside one transaction per portfolio: create Space → Folders (programmes) → Lists (projects) → StatusGroup → Tasks (preserve createdAt, seq assigned in createdAt order) → assignees/watchers → comments (plain text → TipTap) → attachments (re-key storage) → Activity rows synthesized for status history if available.
3. Custom fields: create Space-level definitions for portfolio metadata (Budget MONEY, Health DROPDOWN, Exec Sponsor PEOPLE) and populate.
4. Write `LegacyMap { legacyType, legacyId, newType, newId }` for redirects + rollback.
5. Post-checks (script asserts): task counts match, no task without list/status, every legacy URL resolves via LegacyMap, random 50-task field-by-field diff sample.

## Rollout

1. Staging copy → dry run → fix warnings → execute → QA both tenants.
2. Production: maintenance window; execute; legacy routes 301 via LegacyMap; legacy tables renamed `_legacy_*` (kept 1 release, then dropped).
3. Rollback plan: legacy tables untouched by migration; feature flag `NEXT_PUBLIC_HIERARCHY=off` restores old routes.
