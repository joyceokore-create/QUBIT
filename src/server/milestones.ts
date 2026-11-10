import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";

/** PRD Module 8 — project milestones. Overdue = Pending with a past due date. */

export class MilestoneError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "MilestoneError";
  }
}

export interface MilestoneRow {
  id: string;
  name: string;
  dueDate: Date | null;
  status: string;
  overdue: boolean;
}

export async function listMilestones(ctx: TenantContext, projectId: string): Promise<MilestoneRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectMilestone.findMany({
      where: { projectId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    const now = Date.now();
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      dueDate: m.dueDate,
      status: m.status,
      overdue: m.status !== "Done" && m.dueDate !== null && m.dueDate.getTime() < now,
    }));
  });
}

export const CreateMilestoneInput = z.object({
  name: z.string().min(1),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInput>;

export async function createMilestone(ctx: TenantContext, projectId: string, input: CreateMilestoneInput) {
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const max = await tx.projectMilestone.aggregate({ where: { projectId }, _max: { orderIndex: true } });
    const m = await tx.projectMilestone.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        name: input.name,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
      },
    });
    await audit(tx, ctx, { action: "create", entityType: "project_milestone", entityId: m.id, after: { name: m.name } });
    return m;
  });
}

export const UpdateMilestoneInput = z.object({
  name: z.string().min(1).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(["Pending", "Done"]).optional(),
});
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneInput>;

export async function updateMilestone(ctx: TenantContext, id: string, input: UpdateMilestoneInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.projectMilestone.findUnique({ where: { id }, select: { status: true, name: true, dueDate: true } });
    if (!before) throw new MilestoneError("Milestone not found.", "NOT_FOUND");
    const m = await tx.projectMilestone.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    // UX7: audit every field that can change (name and due date were silently unaudited).
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_milestone",
      entityId: id,
      before: { status: before.status, name: before.name, dueDate: before.dueDate?.toISOString() ?? null },
      after: { status: m.status, name: m.name, dueDate: m.dueDate?.toISOString() ?? null },
    });
    return m;
  });
}

/** The project a milestone belongs to (for the per-project write check), or null. */
export async function milestoneProjectId(ctx: TenantContext, id: string): Promise<string | null> {
  const row = await withTenant(ctx, (tx) => tx.projectMilestone.findUnique({ where: { id }, select: { projectId: true } }));
  return row?.projectId ?? null;
}

// ── UX7: "Update an overdue milestone" (PM Today drawer) ───────────────────────────

export const SLIP_REASONS = ["Vendor or third party late", "Dependency not ready", "Scope changed", "Not enough people", "Testing found issues", "Other"] as const;
export const GO_LIVE_EFFECTS = ["No change", "Moves", "Not sure yet"] as const;

export const RescheduleMilestoneInput = z.object({
  /** The new due day, "YYYY-MM-DD" in the tenant's time zone. */
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a new date."),
  reason: z.enum(SLIP_REASONS),
  goLiveEffect: z.enum(GO_LIVE_EFFECTS),
  note: z.string().trim().max(500).optional(),
});
export type RescheduleMilestoneInputT = z.infer<typeof RescheduleMilestoneInput>;

/**
 * Move a milestone to a new date and record why. The original date is kept in the audit
 * history (before → after, with the reason, go-live effect and note), so nothing is lost.
 * The new date must be today or later in the tenant's time zone and may not be more than two
 * years out. Emits `milestone.rescheduled` so the weekly check-in draft and activity feed can
 * report the slip.
 */
export async function rescheduleMilestone(
  ctx: TenantContext,
  id: string,
  input: RescheduleMilestoneInputT & { dueAt: Date; todayKey: string },
) {
  if (input.newDate < input.todayKey) throw new MilestoneError("The new date can't be in the past.", "BAD_INPUT");
  const maxDay = new Date(Date.parse(`${input.todayKey}T12:00:00Z`) + 730 * 86_400_000).toISOString().slice(0, 10);
  if (input.newDate > maxDay) throw new MilestoneError("The new date is more than two years away.", "BAD_INPUT");
  return withTenant(ctx, async (tx) => {
    const before = await tx.projectMilestone.findUnique({ where: { id }, select: { projectId: true, name: true, dueDate: true, status: true } });
    if (!before) throw new MilestoneError("Milestone not found.", "NOT_FOUND");
    if (before.status === "Done") throw new MilestoneError("This milestone is already done.", "BAD_INPUT");
    const m = await tx.projectMilestone.update({ where: { id }, data: { dueDate: input.dueAt } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_milestone",
      entityId: id,
      before: { dueDate: before.dueDate?.toISOString() ?? null },
      after: {
        dueDate: m.dueDate?.toISOString() ?? null,
        rescheduled: true,
        reason: input.reason,
        goLiveEffect: input.goLiveEffect,
        note: input.note || null,
      },
    });
    await emitDomainEvent(tx, ctx, {
      type: "milestone.rescheduled",
      entityType: "project_milestone",
      entityId: id,
      payload: {
        projectId: before.projectId,
        from: before.dueDate?.toISOString() ?? null,
        to: m.dueDate?.toISOString() ?? null,
        goLiveEffect: input.goLiveEffect,
      },
    });
    return m;
  });
}

export async function deleteMilestone(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    await tx.projectMilestone.deleteMany({ where: { id } });
    await audit(tx, ctx, { action: "delete", entityType: "project_milestone", entityId: id, before: { id } });
    return { id };
  });
}
