# 30 — P1-D Execution Spec: Resource Requests

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read, implement, stop for review)
**Phase:** P1. Pairs with wireframe `qubit-wizards-wireframes.html` (Assign people →
"Raise as resource request"). Depends on P1-C (assignment).
**Type:** New model + server + routes + UI. One Prisma migration.

## 0. Load first
- P1-C `src/server/assignment.ts` (fulfilling a request = an `assignMember` call).
- `src/lib/roles.ts` `PROJECT_ROLES`; `src/server/resources.ts` `listWorkload` (to fill).
- Notifications: `src/server/notifications.ts` + the SSE bell (`src/server/realtime.ts`).
- `docs/26 §4.3` (a PM requests "1 QA, 60%, Aug–Sep"; Head/resource owner fills it).

## 1. Goal
Turn staffing gaps into a tracked flow instead of side-channel chats: a PM raises a need on
a project; the Head of PMs (or resource owner) sees the open requests and fills each from a
capacity view, which creates the assignment.

## 2. Schema (migration `mN_resource_requests`)
```prisma
model ResourceRequest {
  id            String    @id @default(cuid())
  tenantId      String    @map("tenant_id")
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  projectId     String    @map("project_id")
  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  role          String                              // a PROJECT_ROLES value
  allocationPct Int?      @map("allocation_pct")
  startDate     DateTime? @map("start_date")
  endDate       DateTime? @map("end_date")
  note          String?
  status        String    @default("Open")          // Open | Filled | Cancelled
  filledUserId  String?   @map("filled_user_id")
  filledById    String?   @map("filled_by_id")
  createdById   String    @map("created_by_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@index([tenantId, status])
  @@index([tenantId, projectId])
  @@map("resource_request")
}
```
Add the back-relation on `Tenant` and `Project`. **RLS:** add `resource_request` to the
tenant-table array in `prisma/rls.sql` AND create the policy in this migration (DM1.18).
Migrate + generate.

## 3. Server — `src/server/resource-requests.ts` (new)
```ts
export const CreateResourceRequestInput = z.object({
  projectId: z.string().uuid(), role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(0).max(100).nullable().optional(),
  startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(),
  note: z.string().max(500).optional(),
});
// raiseRequest(ctx, input): PM of the project (lib/access.ts) creates it; audit; notify
//   the Head of PMs (notifications.ts + SSE). Return {id}.
// listRequests(ctx, {status?}): open requests across the tenant (Head view) or per project.
// fillRequest(ctx, id, userId): gate project:create OR iam-ish head; call assignMember
//   (P1-C) with the request's role/allocation/dates → set status Filled, filledUserId,
//   filledById; audit "fill"; notify the requesting PM. Atomic (one tx).
// cancelRequest(ctx, id, reason): requester or Head; status Cancelled; audit.
```

## 4. Routes
- `POST /api/resource-requests` → `raiseRequest` (membership-write on the project).
- `GET /api/resource-requests?status=Open` → `listRequests` (Head; `project:create`).
- `POST /api/resource-requests/[id]/fill` → `fillRequest`.
- `POST /api/resource-requests/[id]/cancel` → `cancelRequest`.

## 5. UI
- **Raise**: a "Raise as resource request" action in the assign panel (P1-C) and in the
  project wizard Team step for unfilled seats → small dialog (role, allocation, dates, note).
- **Fill (Head)**: a "Resource requests" surface (a section on the Head dashboard and/or
  `/people`): list open requests; each opens the P1-C candidate panel scoped to the
  requested role/window; filling creates the assignment and closes the request.
- Both via `useAdminMutation`; the Head bell shows new requests (SSE).

## 6. Acceptance
- A PM raises a request on their project; the Head is notified and sees it in the open list.
- Filling a request creates a `ProjectMember` (with the request's role/allocation/dates via
  P1-C, honouring capacity warnings) and flips the request to Filled atomically.
- A PM cannot fill (only raise/cancel their own); the Head can fill. Test both ways.
- Cancel requires a reason; all transitions audited; RLS isolation holds.

## 7. Tests
- `tests/rls/resource-requests.test.ts`: raise → notify → fill (creates assignment) → PM
  notified; permission matrix (PM raises, Head fills); cancel; cross-tenant isolation;
  audit rows; `resource_request` RLS policy present (extends the M-O1 coverage test).

## 8. Verify
```bash
pnpm prisma migrate dev && pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- resource-requests
```
Commit: `feat(resources): resource requests — PM raise → Head fill (P1-D)`.
