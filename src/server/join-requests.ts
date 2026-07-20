import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { PROJECT_ROLES } from "@/lib/roles";
import { notifyUsers } from "@/server/notifications";

/**
 * Project join requests (PROMPT §2/§5/§6). Anyone may request to join a project; the project's
 * lead/PM — or a head/SuperAdmin (project:write governance) — approves. Approval creates a
 * ProjectMember with the granted role; an Executive who joins defaults to "Stakeholder"
 * (read+comment, assumption 5). Every decision is audited.
 */

const PM_PROJECT_ROLES = ["Project Manager"];

export class JoinRequestError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "ALREADY_MEMBER" | "FORBIDDEN" | "BAD_STATE",
  ) {
    super(message);
    this.name = "JoinRequestError";
  }
}

export const RequestToJoinInput = z.object({
  // Canonical project roles only (Phase 6.1, DM1.15 №1) — legacy free-text rows are read
  // fine (they map to Stakeholder via projectRoleCategory), but new requests are validated.
  requestedRole: z.enum(PROJECT_ROLES).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
export type RequestToJoinInput = z.infer<typeof RequestToJoinInput>;

/** Anyone may request to join. Rejects if already a member; returns the existing pending
 * request if one is already open (idempotent). Notifies the project's PM (lead + PM-role
 * members); if the project has none, falls back to HeadOfProjects (per Joyce) — so a
 * request never lands nowhere. */
export async function requestToJoin(ctx: TenantContext, projectId: string, input: RequestToJoinInput) {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, leadUserId: true } });
    if (!project) throw new JoinRequestError("Project not found.", "NOT_FOUND");
    if (project.leadUserId === ctx.userId) throw new JoinRequestError("You already lead this project.", "ALREADY_MEMBER");
    const member = await tx.projectMember.findFirst({ where: { projectId, userId: ctx.userId }, select: { id: true } });
    if (member) throw new JoinRequestError("You're already a member of this project.", "ALREADY_MEMBER");

    const existing = await tx.joinRequest.findFirst({
      where: { projectId, userId: ctx.userId, status: "Pending" },
      select: { id: true },
    });
    if (existing) return { id: existing.id, status: "Pending" as const, alreadyPending: true };

    const jr = await tx.joinRequest.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        userId: ctx.userId,
        requestedRole: input.requestedRole ?? null,
        note: input.note ?? null,
      },
    });

    // Notify approvers. Recipients mirror the approval gate (canWriteProject): the lead +
    // PM-role members; with neither, every HeadOfProjects in the tenant.
    const pmMembers = await tx.projectMember.findMany({
      where: { projectId, role: { in: PM_PROJECT_ROLES } },
      select: { userId: true },
    });
    const recipients = new Set<string>(pmMembers.map((m) => m.userId));
    if (project.leadUserId) recipients.add(project.leadUserId);
    recipients.delete(ctx.userId);
    if (recipients.size === 0) {
      const heads = await tx.roleAssignment.findMany({ where: { role: "HeadOfProjects" }, select: { userId: true } });
      for (const h of heads) recipients.add(h.userId);
      recipients.delete(ctx.userId);
    }
    const requester = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    await notifyUsers(
      tx,
      ctx,
      [...recipients].map((userId) => ({
        userId,
        kind: "join_request",
        message: `${requester?.name ?? "Someone"} requested to join ${project.name}${jr.requestedRole ? ` as ${jr.requestedRole}` : ""}`,
        link: "/my-tasks", // the "Awaiting my approval" queue
      })),
    );

    await audit(tx, ctx, {
      action: "create",
      entityType: "join_request",
      entityId: jr.id,
      after: { projectId, requestedRole: jr.requestedRole, notified: recipients.size },
    });
    return { id: jr.id, status: "Pending" as const, alreadyPending: false };
  });
}

export interface PendingJoinRequest {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  userId: string;
  userName: string;
  requestedRole: string | null;
  note: string | null;
  createdAt: Date;
}

/** Pending requests the viewer may decide — those on projects they lead/PM, plus ALL pending
 * for heads/SuperAdmin (project:write governance). Powers the "Awaiting my approval" queue. */
export async function listPendingForApprover(ctx: TenantContext): Promise<PendingJoinRequest[]> {
  return withTenant(ctx, async (tx) => {
    const seeAll = can(ctx, "project:write"); // PlatformSuperAdmin, HeadOfProjects
    let where: { status: string; projectId?: { in: string[] } } = { status: "Pending" };
    if (!seeAll) {
      const [led, pm] = await Promise.all([
        tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
        tx.projectMember.findMany({ where: { userId: ctx.userId, role: { in: PM_PROJECT_ROLES } }, select: { projectId: true } }),
      ]);
      const ids = [...new Set([...led.map((p) => p.id), ...pm.map((m) => m.projectId)])];
      where = { status: "Pending", projectId: { in: ids.length ? ids : ["__none__"] } };
    }
    const rows = await tx.joinRequest.findMany({
      where,
      include: { project: { select: { code: true, name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      userId: r.userId,
      userName: r.user.name,
      requestedRole: r.requestedRole,
      note: r.note,
      createdAt: r.createdAt,
    }));
  });
}

async function loadDecidable(ctx: TenantContext, id: string) {
  const jr = await withTenant(ctx, (tx) =>
    tx.joinRequest.findUnique({ where: { id }, select: { id: true, projectId: true, userId: true, status: true, requestedRole: true } }),
  );
  if (!jr) throw new JoinRequestError("Request not found.", "NOT_FOUND");
  if (jr.status !== "Pending") throw new JoinRequestError("This request has already been decided.", "BAD_STATE");
  if (!(await canWriteProject(ctx, jr.projectId))) {
    throw new JoinRequestError("Only the project's lead or PM can decide join requests.", "FORBIDDEN");
  }
  return jr;
}

/** Approve: create the ProjectMember (Executive → Stakeholder) and mark the request Approved. */
export async function approveJoinRequest(ctx: TenantContext, id: string): Promise<void> {
  const jr = await loadDecidable(ctx, id);
  await withTenant(ctx, async (tx) => {
    const isExec = (await tx.roleAssignment.findFirst({ where: { userId: jr.userId, role: "Executive" }, select: { id: true } })) != null;
    const role = isExec ? "Stakeholder" : jr.requestedRole ?? "Stakeholder";
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: jr.projectId, userId: jr.userId } },
      create: { tenantId: ctx.tenantId, projectId: jr.projectId, userId: jr.userId, role },
      update: { role },
    });
    await tx.joinRequest.update({
      where: { id },
      data: { status: "Approved", decidedById: ctx.userId, decidedAt: new Date() },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "join_request",
      entityId: id,
      before: { status: "Pending" },
      after: { status: "Approved", role },
    });
  });
}

/** Deny: mark the request Denied (no membership created). */
export async function denyJoinRequest(ctx: TenantContext, id: string): Promise<void> {
  await loadDecidable(ctx, id);
  await withTenant(ctx, async (tx) => {
    await tx.joinRequest.update({
      where: { id },
      data: { status: "Denied", decidedById: ctx.userId, decidedAt: new Date() },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "join_request",
      entityId: id,
      before: { status: "Pending" },
      after: { status: "Denied" },
    });
  });
}
