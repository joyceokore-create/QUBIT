// M-P1d (docs/27 §2, docs/26 §4.3) — staffing as a tracked flow. A PM asks for a SHAPE
// ("1 QA · 60% · Aug–Sep"), the Head fills it from the bench or declines with a reason;
// every transition is audited and the raiser is notified. The asker never resolves their
// own ask: raising is delivery-owner-scoped (access.ts), resolving is staffing:manage.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { canRaiseResourceRequest } from "@/lib/access";
import { PROJECT_ROLES } from "@/lib/roles";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";

export class StaffingError extends Error {
  code: string;
  constructor(message: string, code = "STAFFING_ERROR") {
    super(message);
    this.code = code;
  }
}

export const RaiseRequestInput = z.object({
  projectId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(1).max(100),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  note: z.string().trim().max(300).optional(),
});
export type RaiseRequestInputT = z.infer<typeof RaiseRequestInput>;

/**
 * DM1.73 — tx-level request creation, shared by raiseResourceRequest (below) and the
 * project wizard's unfilled-seat handoff (src/server/project-wizard.ts), so both paths
 * write the same audit row and notify the same Heads. Authorisation is the CALLER's
 * job: raiseResourceRequest checks canRaiseResourceRequest; the wizard is creating the
 * project itself, which is licence enough to ask for its team.
 */
export async function createResourceRequestInTx(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  seat: {
    projectId: string;
    role: string;
    allocationPct: number;
    windowStart: Date;
    windowEnd: Date;
    note?: string | null;
  },
) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: seat.projectId },
    select: { id: true, code: true, name: true },
  });
  const request = await tx.resourceRequest.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: project.id,
      raisedById: ctx.userId,
      role: seat.role,
      allocationPct: seat.allocationPct,
      windowStart: seat.windowStart,
      windowEnd: seat.windowEnd,
      note: seat.note ?? null,
    },
  });
  await audit(tx, ctx, {
    action: "create",
    entityType: "resource_request",
    entityId: request.id,
    after: { projectId: project.id, role: request.role, allocationPct: request.allocationPct },
  });
  // Notify everyone who can fill it (the Heads) — staffing leaves the side channel.
  const heads = await tx.roleAssignment.findMany({
    where: { role: { in: ["HeadOfProjects", "PlatformSuperAdmin"] } },
    select: { userId: true },
  });
  await emitDomainEvent(tx, ctx, {
    type: "resource_request.created",
    entityType: "resource_request",
    entityId: request.id,
    payload: { projectCode: project.code, role: request.role, allocationPct: request.allocationPct },
    notify: [...new Set(heads.map((h) => h.userId))]
      .filter((id) => id !== ctx.userId)
      .map((userId) => ({
        userId,
        kind: "resource_request.created",
        message: `${project.code} asks for 1 ${request.role} · ${request.allocationPct}%.`,
        link: "/staffing",
      })),
  });
  return request;
}

export async function raiseResourceRequest(ctx: TenantContext, input: RaiseRequestInputT) {
  if (new Date(input.windowStart) > new Date(input.windowEnd)) {
    throw new StaffingError("The window cannot end before it starts.", "BAD_WINDOW");
  }
  if (!(await canRaiseResourceRequest(ctx, input.projectId))) {
    throw new StaffingError("Only the project's lead or PM can raise a request for it.", "FORBIDDEN");
  }
  return withTenant(ctx, (tx) =>
    createResourceRequestInTx(tx, ctx, {
      projectId: input.projectId,
      role: input.role,
      allocationPct: input.allocationPct,
      windowStart: new Date(input.windowStart),
      windowEnd: new Date(input.windowEnd),
      note: input.note ?? null,
    }),
  );
}

export interface ResourceRequestRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  raisedById: string;
  raisedByName: string;
  role: string;
  allocationPct: number;
  windowStart: Date;
  windowEnd: Date;
  note: string | null;
  status: string;
  resolvedNote: string | null;
  filledName: string | null;
  createdAt: Date;
}

/** Head (staffing:manage) sees every request; anyone else sees the ones they raised. */
export async function listResourceRequests(ctx: TenantContext): Promise<ResourceRequestRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.resourceRequest.findMany({
      where: can(ctx, "staffing:manage") ? {} : { raisedById: ctx.userId },
      include: {
        project: { select: { code: true, name: true } },
        raisedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // Open first, then newest — the queue reads top-down.
    rows.sort((a, b) => (a.status === "Open" ? -1 : 1) - (b.status === "Open" ? -1 : 1) || +b.createdAt - +a.createdAt);
    const filledIds = rows.map((r) => r.filledMemberId).filter((x): x is string => !!x);
    const filledMembers = filledIds.length
      ? await tx.projectMember.findMany({
          where: { id: { in: filledIds } },
          select: { id: true, user: { select: { name: true } } },
        })
      : [];
    const filledById = new Map(filledMembers.map((m) => [m.id, m.user.name]));
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      raisedById: r.raisedById,
      raisedByName: r.raisedBy.name,
      role: r.role,
      allocationPct: r.allocationPct,
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      note: r.note,
      status: r.status,
      resolvedNote: r.resolvedNote,
      filledName: r.filledMemberId ? (filledById.get(r.filledMemberId) ?? null) : null,
      createdAt: r.createdAt,
    }));
  });
}

export interface BenchRow {
  userId: string;
  name: string;
  /** Booked allocation across projects (typed, like listWorkload.totalPct). */
  totalPct: number;
  /** Days of approved leave inside the request window. */
  awayDaysInWindow: number;
}

/** Candidates for a window: every active user, leave surfaced. DM1.73 (docs/29 §3) —
 * when the request names a role, people who hold (or have held) that role hat on any
 * project sort FIRST, then by load: a role-fit SOFT sort, never a hard filter — the
 * fill still assigns whatever hat the request asked for. */
export async function benchFor(
  ctx: TenantContext,
  windowStart: Date,
  windowEnd: Date,
  role?: string,
): Promise<BenchRow[]> {
  return withTenant(ctx, async (tx) => {
    const [users, allocations, absences, roleHolders] = await Promise.all([
      tx.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
      tx.projectMember.groupBy({ by: ["userId"], _sum: { allocationPct: true } }),
      tx.absence.findMany({
        where: { startDate: { lte: windowEnd }, endDate: { gte: windowStart } },
        select: { userId: true, startDate: true, endDate: true },
      }),
      // DM1.73 — the one extra query the soft sort costs.
      role
        ? tx.projectMember.findMany({ where: { role }, select: { userId: true }, distinct: ["userId"] })
        : Promise.resolve([] as { userId: string }[]),
    ]);
    const fitsRole = new Set(roleHolders.map((r) => r.userId));
    const loadByUser = new Map(allocations.map((a) => [a.userId, a._sum.allocationPct ?? 0]));
    const awayByUser = new Map<string, number>();
    for (const a of absences) {
      const from = a.startDate > windowStart ? a.startDate : windowStart;
      const to = a.endDate < windowEnd ? a.endDate : windowEnd;
      const days = Math.max(0, Math.round((+to - +from) / 86_400_000) + 1);
      awayByUser.set(a.userId, (awayByUser.get(a.userId) ?? 0) + days);
    }
    return users
      .map((u) => ({
        userId: u.id,
        name: u.name,
        totalPct: loadByUser.get(u.id) ?? 0,
        awayDaysInWindow: awayByUser.get(u.id) ?? 0,
      }))
      // Role holders first (soft), then least booked, leave-in-window as tie-break.
      .sort(
        (a, b) =>
          Number(fitsRole.has(b.userId)) - Number(fitsRole.has(a.userId)) ||
          a.totalPct - b.totalPct ||
          a.awayDaysInWindow - b.awayDaysInWindow,
      );
  });
}

export async function fillResourceRequest(ctx: TenantContext, requestId: string, userId: string) {
  if (!can(ctx, "staffing:manage")) throw new StaffingError("Filling requests needs staffing:manage.", "FORBIDDEN");
  return withTenant(ctx, async (tx) => {
    const request = await tx.resourceRequest.findUnique({
      where: { id: requestId },
      include: { project: { select: { code: true, name: true } } },
    });
    if (!request) throw new StaffingError("Request not found.", "NOT_FOUND");
    if (request.status !== "Open") {
      throw new StaffingError("This request was already resolved.", "ALREADY_RESOLVED");
    }
    await tx.user.findUniqueOrThrow({ where: { id: userId } }).catch(() => {
      throw new StaffingError("Candidate not found.", "MEMBER_NOT_FOUND");
    });

    // The receipt: the assignment created (or re-shaped) by this fill.
    const member = await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: request.projectId, userId } },
      create: {
        tenantId: ctx.tenantId,
        projectId: request.projectId,
        userId,
        role: request.role,
        allocationPct: request.allocationPct,
        startDate: request.windowStart,
        endDate: request.windowEnd,
      },
      update: {
        role: request.role,
        allocationPct: request.allocationPct,
        startDate: request.windowStart,
        endDate: request.windowEnd,
      },
    });
    const updated = await tx.resourceRequest.update({
      where: { id: requestId },
      data: { status: "Filled", resolvedById: ctx.userId, resolvedAt: new Date(), filledMemberId: member.id },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "resource_request",
      entityId: requestId,
      before: { status: "Open" },
      after: { status: "Filled", filledUserId: userId, filledMemberId: member.id },
    });
    await emitDomainEvent(tx, ctx, {
      type: "resource_request.filled",
      entityType: "resource_request",
      entityId: requestId,
      payload: { projectId: request.projectId, userId },
      notify: [
        ...(request.raisedById !== ctx.userId
          ? [{
              userId: request.raisedById,
              kind: "resource_request.filled",
              message: `Your ${request.role} request on ${request.project.code} was filled.`,
              link: `/projects/${request.projectId}`,
            }]
          : []),
        ...(userId !== ctx.userId
          ? [{
              userId,
              kind: "project.assigned",
              message: `You were assigned to ${request.project.name} as ${request.role} (${request.allocationPct}%).`,
              link: `/projects/${request.projectId}`,
            }]
          : []),
      ],
    });
    return updated;
  });
}

/** docs/27 §5 gap 4 (30-p1d) — the RAISER may withdraw their own open ask; the Head may
 * too (tidying a stale queue). Distinct from Declined: cancelled means "no longer
 * needed", declined means "refused, here's why". */
export async function cancelResourceRequest(ctx: TenantContext, requestId: string, reason?: string) {
  return withTenant(ctx, async (tx) => {
    const request = await tx.resourceRequest.findUnique({
      where: { id: requestId },
      include: { project: { select: { code: true } } },
    });
    if (!request) throw new StaffingError("Request not found.", "NOT_FOUND");
    if (request.raisedById !== ctx.userId && !can(ctx, "staffing:manage")) {
      throw new StaffingError("Only the raiser or the Head can cancel a request.", "FORBIDDEN");
    }
    if (request.status !== "Open") {
      throw new StaffingError("This request was already resolved.", "ALREADY_RESOLVED");
    }
    const updated = await tx.resourceRequest.update({
      where: { id: requestId },
      data: {
        status: "Cancelled",
        resolvedById: ctx.userId,
        resolvedAt: new Date(),
        resolvedNote: reason?.trim() || null,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "resource_request",
      entityId: requestId,
      before: { status: "Open" },
      after: { status: "Cancelled", reason: reason?.trim() || null },
    });
    await emitDomainEvent(tx, ctx, {
      type: "resource_request.cancelled",
      entityType: "resource_request",
      entityId: requestId,
      payload: { projectId: request.projectId },
      notify:
        request.raisedById !== ctx.userId
          ? [{
              userId: request.raisedById,
              kind: "resource_request.cancelled",
              message: `Your ${request.role} request on ${request.project.code} was cancelled.`,
              link: "/staffing",
            }]
          : [],
    });
    return updated;
  });
}

export async function declineResourceRequest(ctx: TenantContext, requestId: string, reason: string) {
  if (!can(ctx, "staffing:manage")) throw new StaffingError("Declining requests needs staffing:manage.", "FORBIDDEN");
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new StaffingError("A decline needs a reason.", "REASON_REQUIRED");
  return withTenant(ctx, async (tx) => {
    const request = await tx.resourceRequest.findUnique({
      where: { id: requestId },
      include: { project: { select: { code: true } } },
    });
    if (!request) throw new StaffingError("Request not found.", "NOT_FOUND");
    if (request.status !== "Open") {
      throw new StaffingError("This request was already resolved.", "ALREADY_RESOLVED");
    }
    const updated = await tx.resourceRequest.update({
      where: { id: requestId },
      data: { status: "Declined", resolvedById: ctx.userId, resolvedAt: new Date(), resolvedNote: trimmed },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "resource_request",
      entityId: requestId,
      before: { status: "Open" },
      after: { status: "Declined", reason: trimmed },
    });
    await emitDomainEvent(tx, ctx, {
      type: "resource_request.declined",
      entityType: "resource_request",
      entityId: requestId,
      payload: { projectId: request.projectId },
      notify:
        request.raisedById !== ctx.userId
          ? [{
              userId: request.raisedById,
              kind: "resource_request.declined",
              message: `Your ${request.role} request on ${request.project.code} was declined: ${trimmed}`,
              link: "/staffing",
            }]
          : [],
    });
    return updated;
  });
}
