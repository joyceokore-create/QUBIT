import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

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
    const before = await tx.projectMilestone.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new MilestoneError("Milestone not found.", "NOT_FOUND");
    const m = await tx.projectMilestone.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_milestone",
      entityId: id,
      before: { status: before.status },
      after: { status: m.status },
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
