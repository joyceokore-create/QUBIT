# 29 — P1-C Execution Spec: Assignment, Dated Allocations & Capacity

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read, implement, stop for review)
**Phase:** P1. Pairs with wireframe `qubit-wizards-wireframes.html` (Assign people).
**Type:** Small schema add + server (builds on existing capacity math) + assign panel UI.

## 0. Load first
- `prisma/schema.prisma` `model ProjectMember`: has `role`, `allocationPct Int?`, unique
  `[projectId,userId]` — **no start/end dates yet**.
- `src/server/resources.ts:154` `listWorkload()` → already leave-aware: returns
  `totalPct`, `effectivePct`, `availability` (0–1), `onLeaveUntil`, per-project allocations.
  **This is the base for candidate ranking and warnings — reuse, don't recompute.**
- `src/server/absence*` + `Absence` model (leave windows). `User.capacityHoursPerWeek` (=40).
- `src/lib/roles.ts` `PROJECT_ROLES` + `projectRoleCategory`. `src/lib/access.ts` membership
  write rules. `docs/26 §4.3` (assignment = person + role hat + allocation % + dates).

## 1. Goal
Make assignment a first-class, capacity- and leave-aware action: dated allocations, a
candidate panel ranked by real availability, inline over-allocation / leave-window
warnings, suggested alternates, and bulk assign — replacing the bare membership row.

## 2. Schema (migration `mN_dated_allocations`)
```prisma
// model ProjectMember
startDate DateTime? @map("start_date")
endDate   DateTime? @map("end_date")
```
Column-only on an RLS-protected table; no `rls.sql` change. Migrate + generate.

## 3. Server — `src/server/assignment.ts` (new)
```ts
export const AssignInput = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(0).max(100).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  overrideWarnings: z.boolean().default(false),  // caller acknowledged the amber flags
});

// assignMember(ctx, input): upsert ProjectMember (unique projectId+userId) with role +
//   allocation + dates; compute warnings first (see below). If blocking warnings and
//   !overrideWarnings → throw AssignmentError("...", "NEEDS_OVERRIDE") with the warning list.
//   Audit "assign" (before/after role+allocation). Membership-write gated per lib/access.ts.
// assignMembers(ctx, projectId, rows[]): bulk; used by the project wizard (P1-B). One tx.
// removeMember(ctx, projectId, userId): audited.
// candidatesFor(ctx, { role, allocationPct, startDate, endDate }): reuse listWorkload,
//   filter to plausible fits (role category match is a soft sort, not a hard filter),
//   sort by effective availability ascending load; annotate each with the warnings it
//   would trigger; return the top alternate suggestion.
```
**Warning rules** (compute in `assignmentWarnings(user, alloc, window)` — pure, unit-testable):
- **Over-allocation**: `totalPct (incl. this) > 100` over the window → amber, overridable.
- **Leave-window overlap**: the allocation window intersects an `Absence` → amber, overridable.
- Neither blocks hard; both require `overrideWarnings` to persist (records the ack in audit).

## 4. Routes
- `POST /api/projects/[id]/members` → `assignMember` (gate: membership-write via
  `lib/access.ts` — PM of that project, Head, SuperAdmin).
- `DELETE /api/projects/[id]/members/[userId]` → `removeMember`.
- `GET /api/projects/[id]/candidates?role=&pct=&from=&to=` → `candidatesFor`.
(The existing workspace Team tab and the P1-B wizard both call these.)

## 5. UI — `src/components/assignment/assign-panel.tsx` (new, reused by workspace Team + wizard)
- Query `candidatesFor`; table of candidates with a load bar (green/amber/red by
  effectivePct), leave badge (`onLeaveUntil`), role-fit tag; "Assign" or "Assign anyway"
  (when it would warn).
- On a warning: inline banner naming the conflict + the suggested alternate (as in the
  wireframe); assigning sets `overrideWarnings:true`.
- Bulk mode: multi-select people (or the wizard passes a template set) → `assignMembers`.
- Uses `useAdminMutation`.

## 6. Acceptance
- Assigning sets role + allocation + dates; the workspace Team tab and `/people` workload
  reflect it (leave-aware `effectivePct`).
- Assigning past 100% or into a leave window shows the warning + alternate and only
  persists with an acknowledged override (recorded in audit).
- Candidate list ranks by real availability; a fully-booked person sorts last.
- Bulk assign from the project wizard seeds all members in one transaction.
- RLS + membership-write gates enforced (a PM cannot assign on a project they don't lead —
  test both ways).

## 7. Tests
- `tests/unit/assignment-warnings.test.ts`: over-allocation + leave-overlap truth tables.
- `tests/rls/assignment.test.ts`: assign/override/remove; candidate ranking respects
  leave; membership-write gate (allowed for PM-of-project, denied otherwise); audit rows;
  cross-tenant isolation.

## 8. Verify
```bash
pnpm prisma migrate dev && pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- assignment
```
Commit: `feat(resources): capacity- & leave-aware assignment with dated allocations (P1-C)`.
