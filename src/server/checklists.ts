import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { ORDER_STEP } from "@/server/ordering";
import { NotFoundError } from "@/server/errors";

/**
 * Checklists on a task (04-module-specs §2): named checklists, each with items
 * (name, done, optional assignee). Progress = done/total. Every mutation records
 * Activity against the owning task so it shows in the task's activity feed.
 */

const checklistInclude = {
  items: { orderBy: { orderIndex: "asc" } },
} satisfies Prisma.ChecklistInclude;

async function checklistTaskId(tx: Prisma.TransactionClient, checklistId: string): Promise<string> {
  const cl = await tx.checklist.findUnique({ where: { id: checklistId }, select: { taskId: true } });
  if (!cl) throw new NotFoundError("Checklist not found.");
  return cl.taskId;
}

export async function listChecklists(ctx: TenantContext, taskId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    return tx.checklist.findMany({
      where: { taskId },
      include: checklistInclude,
      orderBy: { orderIndex: "asc" },
    });
  });
}

export async function createChecklist(ctx: TenantContext, taskId: string, name: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    const last = await tx.checklist.findFirst({
      where: { taskId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const checklist = await tx.checklist.create({
      data: { tenantId: ctx.tenantId, taskId, name, orderIndex: (last?.orderIndex ?? 0) + ORDER_STEP },
      include: checklistInclude,
    });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "checklist.created", data: { name } });
    return checklist;
  });
}

export async function updateChecklist(ctx: TenantContext, id: string, name: string) {
  return forTenant(ctx, async (tx) => {
    const taskId = await checklistTaskId(tx, id);
    const checklist = await tx.checklist.update({ where: { id }, data: { name }, include: checklistInclude });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "checklist.updated", data: { name } });
    return checklist;
  });
}

export async function deleteChecklist(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const taskId = await checklistTaskId(tx, id);
    await tx.checklist.delete({ where: { id } });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "checklist.deleted" });
    return { id };
  });
}

export async function addChecklistItem(
  ctx: TenantContext,
  checklistId: string,
  input: { name: string; assigneeId?: string },
) {
  return forTenant(ctx, async (tx) => {
    const taskId = await checklistTaskId(tx, checklistId);
    if (input.assigneeId) {
      assertFound(await tx.user.findUnique({ where: { id: input.assigneeId }, select: { id: true } }), "Assignee not found.");
    }
    const last = await tx.checklistItem.findFirst({
      where: { checklistId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const item = await tx.checklistItem.create({
      data: {
        tenantId: ctx.tenantId,
        checklistId,
        name: input.name,
        assigneeId: input.assigneeId ?? null,
        orderIndex: (last?.orderIndex ?? 0) + ORDER_STEP,
      },
    });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "checklist.item_added", data: { name: input.name } });
    return item;
  });
}

export async function updateChecklistItem(
  ctx: TenantContext,
  itemId: string,
  patch: Partial<{ name: string; done: boolean; assigneeId: string | null }>,
) {
  return forTenant(ctx, async (tx) => {
    const item = await tx.checklistItem.findUnique({ where: { id: itemId }, select: { checklistId: true } });
    if (!item) throw new NotFoundError("Checklist item not found.");
    if (patch.assigneeId) {
      assertFound(await tx.user.findUnique({ where: { id: patch.assigneeId }, select: { id: true } }), "Assignee not found.");
    }
    const taskId = await checklistTaskId(tx, item.checklistId);
    const updated = await tx.checklistItem.update({ where: { id: itemId }, data: patch });
    const verb = patch.done !== undefined ? (patch.done ? "checklist.item_checked" : "checklist.item_unchecked") : "checklist.item_updated";
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb, data: { name: updated.name } });
    return updated;
  });
}

export async function deleteChecklistItem(ctx: TenantContext, itemId: string) {
  return forTenant(ctx, async (tx) => {
    const item = await tx.checklistItem.findUnique({ where: { id: itemId }, select: { checklistId: true } });
    if (!item) throw new NotFoundError("Checklist item not found.");
    const taskId = await checklistTaskId(tx, item.checklistId);
    await tx.checklistItem.delete({ where: { id: itemId } });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "checklist.item_deleted" });
    return { id: itemId };
  });
}
