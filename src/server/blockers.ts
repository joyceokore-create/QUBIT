import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";

/**
 * MVP1 PRD Module 10 — Blocker Register. A blocker is a live impediment on a project:
 * description, severity (Low|Medium|Critical), owner, resolution status + notes.
 * Tenant-scoped (RLS) and audited.
 */

export const BLOCKER_SEVERITIES = ["Low", "Medium", "Critical"] as const;
export const BLOCKER_STATUSES = ["Open", "Resolved"] as const;

export class BlockerError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "BlockerError";
  }
}

export interface BlockerRow {
  id: string;
  projectId: string;
  projectCode: string | null;
  description: string;
  severity: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  /** Task this blocker stalls, if flagged from the board (Phase 6.1 blocked-as-flag). */
  taskId: string | null;
  resolutionNotes: string | null;
  dateRaised: Date;
}

export const CreateBlockerInput = z.object({
  description: z.string().min(1),
  severity: z.enum(BLOCKER_SEVERITIES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
});
export type CreateBlockerInput = z.infer<typeof CreateBlockerInput>;

export const UpdateBlockerInput = z.object({
  description: z.string().min(1).optional(),
  severity: z.enum(BLOCKER_SEVERITIES).optional(),
  status: z.enum(BLOCKER_STATUSES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
});
export type UpdateBlockerInput = z.infer<typeof UpdateBlockerInput>;

export async function listBlockers(
  ctx: TenantContext,
  filters: { projectId?: string } = {},
): Promise<BlockerRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.blocker.findMany({
      where: { projectId: filters.projectId || undefined },
      include: { owner: { select: { name: true } }, project: { select: { code: true } } },
      orderBy: [{ status: "asc" }, { dateRaised: "desc" }],
    });
    return rows.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      projectCode: b.project?.code ?? null,
      description: b.description,
      severity: b.severity,
      status: b.status,
      ownerId: b.ownerId,
      ownerName: b.owner?.name ?? null,
      taskId: b.taskId,
      resolutionNotes: b.resolutionNotes,
      dateRaised: b.dateRaised,
    }));
  });
}

export async function createBlocker(ctx: TenantContext, projectId: string, input: CreateBlockerInput) {
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (input.ownerId) {
      await tx.user.findUniqueOrThrow({ where: { id: input.ownerId } }).catch(() => {
        throw new BlockerError("Owner not found.", "BAD_INPUT");
      });
    }
    const blocker = await tx.blocker.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        description: input.description,
        severity: input.severity ?? "Medium",
        ownerId: input.ownerId ?? null,
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "blocker",
      entityId: blocker.id,
      after: { severity: blocker.severity, description: blocker.description },
    });
    await emitDomainEvent(tx, ctx, {
      type: "blocker.opened",
      entityType: "blocker",
      entityId: blocker.id,
      payload: { projectId, severity: blocker.severity },
    });
    return blocker;
  });
}

export async function updateBlocker(ctx: TenantContext, blockerId: string, input: UpdateBlockerInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.blocker.findUnique({ where: { id: blockerId } });
    if (!before) throw new BlockerError("Blocker not found.", "NOT_FOUND");
    const after = await tx.blocker.update({
      where: { id: blockerId },
      data: {
        description: input.description,
        severity: input.severity,
        status: input.status,
        ownerId: input.ownerId === undefined ? undefined : input.ownerId,
        resolutionNotes: input.resolutionNotes === undefined ? undefined : input.resolutionNotes,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "blocker",
      entityId: blockerId,
      before: { status: before.status, severity: before.severity },
      after: { status: after.status, severity: after.severity },
    });
    if (after.status !== before.status && (after.status === "Resolved" || after.status === "Open")) {
      await emitDomainEvent(tx, ctx, {
        type: after.status === "Resolved" ? "blocker.resolved" : "blocker.opened",
        entityType: "blocker",
        entityId: blockerId,
        payload: { projectId: after.projectId, severity: after.severity },
      });
    }
    return after;
  });
}

export async function removeBlocker(ctx: TenantContext, blockerId: string) {
  return withTenant(ctx, async (tx) => {
    await tx.blocker.deleteMany({ where: { id: blockerId } });
    await audit(tx, ctx, { action: "delete", entityType: "blocker", entityId: blockerId, before: { id: blockerId } });
    return { id: blockerId };
  });
}

export interface BlockerCounts {
  open: number;
  resolved: number;
  critical: number;
}

/** Dashboard roll-up (PRD: Open / Resolved / Critical). */
export async function getBlockerCounts(ctx: TenantContext): Promise<BlockerCounts> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.blocker.findMany({ select: { status: true, severity: true } });
    return {
      open: rows.filter((b) => b.status === "Open").length,
      resolved: rows.filter((b) => b.status === "Resolved").length,
      critical: rows.filter((b) => b.status === "Open" && b.severity === "Critical").length,
    };
  });
}
