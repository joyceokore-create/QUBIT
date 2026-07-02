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

### Administration (IAM v1)

Not covered elsewhere in this doc — added alongside the Admin & IAM v1 build. Users are
listed directly by server components (`src/server/users.ts`'s `listUsers()`); the endpoints
below cover mutations, following the same permission → Zod → `withTenant` → `audit` pattern.

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| POST | `/api/admin/users` | `iam:manage` | Create a user with an initial role set (audited: `create` + one `role_grant` per role) |
| PATCH | `/api/admin/users/:id/roles` | `iam:manage` | Replace a user's roles; diffs and audits `role_grant`/`role_revoke` per change |
| POST | `/api/admin/users/:id/suspend` | `iam:manage` | Set status to `SUSPENDED` (audited `update`) |
| POST | `/api/admin/users/:id/reactivate` | `iam:manage` | Set status back to `ACTIVE` |
| DELETE | `/api/admin/users/:id` | `iam:manage` | Soft-delete: scrubs PII, revokes all roles, blocks login (audited `delete`) |

None of these let a caller act on their own account (suspend/delete/self-demote from
`SystemAdmin`) — a deliberate guard against accidental lockout, enforced in
`src/server/users.ts`, not just the UI.

#### Departments (FR-IAM-03)

Ships with schema + admin UI only — zero seeded rows; real structure is entered by hand
through `/admin/departments` and `/admin/users` (no CSV import yet, see Deferred below).
Gated on `iam:manage`, same as the rest of Administration — no dedicated permission.

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| POST | `/api/admin/departments` | `iam:manage` | Create a department (audited `create`) |
| PATCH | `/api/admin/departments/:id` | `iam:manage` | Update name/parent/org unit/head; rejects a parent change that would create a cycle (audited `update`) |
| DELETE | `/api/admin/departments/:id` | `iam:manage` | Delete; rejects if it has child departments or member users (audited `delete`) |
| PATCH | `/api/admin/users/:id/department` | `iam:manage` | Set a user's department + manager; rejects self-as-manager (audited `update` on the user) |

**Deferred** (not built in v1): CSV bulk user upload (FR-IAM-02), custom role creation —
roles stay hard-coded (`src/lib/rbac.ts`) — and the actual `PlatformSuperAdmin`
tenant-switch mechanism (`POST /api/tenant/switch` from the Session/tenant table above is
still unimplemented; the role currently only grants read-only oversight, not an actual
switch).

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
