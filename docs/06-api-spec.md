# 06 — API / Route Handler Spec

QUBIT uses Next.js Route Handlers (`src/app/api/**`) and Server Actions. Every handler:

1. Calls `getTenantContext()` (401 if no session).
2. Checks the required permission via `rbac.ts` (403 if missing).
3. Validates input with a Zod schema (400 on failure).
4. Runs data access through `withTenant()` so RLS applies.
5. Writes an `audit_log` row for mutations.

All responses are JSON. IDs are UUIDs. Dates are ISO-8601. No `tenantId` is ever accepted from
the client body — it comes from the session only.

## Conventions

- Base: `/api`
- Errors: `{ "error": { "code": "...", "message": "..." } }` with appropriate HTTP status.
- List endpoints support `?status=`, `?orgUnit=`, `?q=` filters (server-side, tenant-scoped).
- Pagination: `?cursor=&limit=` (default limit 50).

## Phase A endpoints

### Session / tenant
| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/me` | authenticated | Current user, roles, tenant + brand tokens |
| POST | `/api/tenant/switch` | `PlatformSuperAdmin` | Switch active tenant (audited) |

### Dashboard
| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/dashboard/summary` | `dashboard:read` | KPI strip totals (items, on-track, at-risk, overdue, budget used) |
| GET | `/api/dashboard/heatmap` | `dashboard:read` | Portfolio × OrgUnit RAG matrix (pct, count, status per cell) |
| GET | `/api/dashboard/escalations` | `dashboard:read` | Recent risks/issues feed |
| GET | `/api/dashboard/milestones/upcoming` | `dashboard:read` | Upcoming milestones feed |

### Portfolios / programmes / projects
| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/portfolios` | `portfolio:read` | List portfolios with rollup (counts, avg progress, subs) |
| GET | `/api/portfolios/:id` | `portfolio:read` | Portfolio detail + its programmes/projects |
| GET | `/api/programmes/:id` | `portfolio:read` | Programme + its projects |
| GET | `/api/projects` | `project:read` | List projects (filters: status, orgUnit, portfolio, q) |
| GET | `/api/projects/:id` | `project:read` | Project detail incl. per-subsidiary status + milestone matrix |
| POST | `/api/projects` | `project:create` | Create project |
| PATCH | `/api/projects/:id` | `project:update` | Update status/dates/owner/budget (audited) |
| GET | `/api/standalone` | `project:read` | Items with no portfolio |
| GET | `/api/subsidiaries/:orgUnitId/projects` | `project:read` | Projects for a subsidiary + KPIs |

### RAID (risks & issues)
| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/risks` | `risk:read` | List risks (filters incl. owner, status, project) |
| POST | `/api/risks` | `risk:create` | Create risk (title, category, prob, impact, mitigation, owner) |
| PATCH | `/api/risks/:id` | `risk:update` | Update risk (status/owner/mitigation) |
| POST | `/api/risks/:id/materialise` | `risk:update` | Convert risk → issue, preserving `originRiskId` |
| GET | `/api/issues` | `issue:read` | List issues (with origin risk link) |
| PATCH | `/api/issues/:id` | `issue:update` | Update issue |
| GET | `/api/raid/gap-report` | `risk:read` | Occurred issues vs original owned risks (PIR gap) |

## Example: create risk

Request `POST /api/risks`
```json
{
  "projectId": "…",
  "title": "Vendor delivery slippage",
  "category": "operational",
  "probability": 4,
  "impact": 4,
  "mitigation": "Weekly vendor checkpoint; contractual milestone penalties",
  "ownerId": "…"
}
```
Zod schema (server):
```ts
const CreateRisk = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(3),
  category: z.string().optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z.string().optional(),
  ownerId: z.string().uuid().optional(),
});
```
Response `201`
```json
{ "id": "…", "status": "Open", "createdAt": "2026-07-01T09:00:00Z" }
```

## Heatmap response shape (matches the dashboard)

```json
{
  "orgUnits": [{ "id":"…","code":"KE","name":"KCB Kenya" }],
  "rows": [
    { "portfolioId":"p1","name":"Digital Transformation","itemCount":5,
      "cells": [ { "orgUnitId":"…","pct":58,"count":3,"status":"AtRisk" }, null ] }
  ]
}
```
`null` cell = no items for that portfolio×subsidiary (render the dashed "—" cell).

## Later phases (B–D)

Add resource/tasks/finance/approvals/notifications/AI endpoints following the same pattern.
Keep the module list aligned with `05-data-model.md` and the QUBIT API domains
(projects, tasks, portfolios, resources, approvals, RAID, finance, reports, notifications,
audit, webhooks, scheduled actions, AI).
