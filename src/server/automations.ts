import type { Prisma, LocationType, Priority, RunStatus } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { NotFoundError } from "@/server/errors";
import { updateTask, setAssignee } from "@/server/tasks";
import { addComment } from "@/server/comments";

/**
 * Automation engine (04-module-specs §9): event → conditions → actions, with a
 * run log and a loop guard. Triggers fire from task mutations (see tasks.ts, which
 * calls `dispatchTaskEvent` after a status change / creation). Actions run through
 * the normal server functions, so they themselves emit Activity + can re-trigger —
 * bounded by MAX_DEPTH.
 */

const MAX_DEPTH = 3;

type TriggerType = "task.status_changed" | "task.created";
interface Trigger {
  type: TriggerType;
  params?: { to?: string[] };
}
interface Condition {
  field: "priority" | "statusId" | "assignee";
  op: "eq" | "neq" | "is_set" | "not_set";
  value?: string;
}
interface Action {
  type: "task.set_status" | "task.set_priority" | "task.set_assignee" | "task.add_comment";
  params: Record<string, string>;
}
export interface TaskEvent {
  type: TriggerType;
  taskId: string;
  toStatusId?: string;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createAutomation(
  ctx: TenantContext,
  input: {
    locationType: LocationType;
    locationId: string;
    name: string;
    trigger: Trigger;
    conditions?: Condition[];
    actions: Action[];
    active?: boolean;
  },
) {
  return forTenant(ctx, async (tx) => {
    const automation = await tx.automation.create({
      data: {
        tenantId: ctx.tenantId,
        locationType: input.locationType,
        locationId: input.locationId,
        name: input.name,
        trigger: input.trigger as unknown as Prisma.InputJsonValue,
        conditions: (input.conditions ?? []) as unknown as Prisma.InputJsonValue,
        actions: input.actions as unknown as Prisma.InputJsonValue,
        active: input.active ?? true,
        createdById: ctx.userId,
      },
    });
    await recordActivity(tx, ctx, {
      objectType: input.locationType.toLowerCase(),
      objectId: input.locationId,
      verb: "automation.created",
      data: { name: automation.name },
    });
    return automation;
  });
}

export async function listAutomations(ctx: TenantContext, locationType: LocationType, locationId: string) {
  return forTenant(ctx, (tx) =>
    tx.automation.findMany({ where: { locationType, locationId }, orderBy: { createdAt: "asc" } }),
  );
}

export async function updateAutomation(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; active: boolean; trigger: Trigger; conditions: Condition[]; actions: Action[] }>,
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.automation.findUnique({ where: { id }, select: { id: true } }), "Automation not found.");
    return tx.automation.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.active !== undefined && { active: patch.active }),
        ...(patch.trigger !== undefined && { trigger: patch.trigger as unknown as Prisma.InputJsonValue }),
        ...(patch.conditions !== undefined && { conditions: patch.conditions as unknown as Prisma.InputJsonValue }),
        ...(patch.actions !== undefined && { actions: patch.actions as unknown as Prisma.InputJsonValue }),
      },
    });
  });
}

export async function deleteAutomation(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const a = await tx.automation.findUnique({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundError("Automation not found.");
    await tx.automation.delete({ where: { id } });
    return { id };
  });
}

export async function listRuns(ctx: TenantContext, automationId: string) {
  return forTenant(ctx, (tx) =>
    tx.automationRun.findMany({ where: { automationId }, orderBy: { createdAt: "desc" }, take: 50 }),
  );
}

// ── Engine ───────────────────────────────────────────────────────────────────

interface Matched {
  id: string;
  actions: Action[];
}

/** Automations at a task's list/folder/space that match the event trigger + conditions. */
async function findMatching(ctx: TenantContext, event: TaskEvent): Promise<Matched[]> {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: event.taskId, deletedAt: null },
      select: {
        statusId: true,
        priority: true,
        list: { select: { spaceId: true, folderId: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!task) return [];

    // Location chain: space → folder chain → list.
    const chain: { type: LocationType; id: string }[] = [{ type: "SPACE", id: task.list.spaceId }];
    let folderId = task.list.folderId;
    while (folderId) {
      chain.push({ type: "FOLDER", id: folderId });
      const f: { parentId: string | null } | null = await tx.folder.findUnique({
        where: { id: folderId },
        select: { parentId: true },
      });
      folderId = f?.parentId ?? null;
    }
    // listId is on the task via list relation; fetch it once more cheaply:
    const listRow = await tx.task.findUnique({ where: { id: event.taskId }, select: { listId: true } });
    if (listRow) chain.push({ type: "LIST", id: listRow.listId });

    const automations = await tx.automation.findMany({
      where: { active: true, OR: chain.map((c) => ({ locationType: c.type, locationId: c.id })) },
    });

    const hasAssignee = task.assignees.length > 0;
    const matched: Matched[] = [];
    for (const a of automations) {
      const trigger = a.trigger as unknown as Trigger;
      if (trigger.type !== event.type) continue;
      if (event.type === "task.status_changed") {
        const to = trigger.params?.to;
        if (to && to.length && (!event.toStatusId || !to.includes(event.toStatusId))) continue;
      }
      const conditions = (a.conditions as unknown as Condition[]) ?? [];
      const pass = conditions.every((c) => {
        if (c.field === "priority") {
          if (c.op === "eq") return task.priority === c.value;
          if (c.op === "neq") return task.priority !== c.value;
          if (c.op === "is_set") return task.priority !== null;
          if (c.op === "not_set") return task.priority === null;
        }
        if (c.field === "statusId") {
          if (c.op === "eq") return task.statusId === c.value;
          if (c.op === "neq") return task.statusId !== c.value;
        }
        if (c.field === "assignee") {
          if (c.op === "is_set") return hasAssignee;
          if (c.op === "not_set") return !hasAssignee;
          if (c.op === "eq") return task.assignees.some((x) => x.userId === c.value);
        }
        return true;
      });
      if (pass) matched.push({ id: a.id, actions: (a.actions as unknown as Action[]) ?? [] });
    }
    return matched;
  });
}

async function runActions(ctx: TenantContext, taskId: string, actions: Action[], depth: number): Promise<string[]> {
  const applied: string[] = [];
  for (const action of actions) {
    switch (action.type) {
      case "task.set_status":
        await updateTask(ctx, taskId, { statusId: action.params.statusId }, { automationDepth: depth });
        applied.push(`set_status→${action.params.statusId}`);
        break;
      case "task.set_priority":
        await updateTask(ctx, taskId, { priority: action.params.priority as Priority }, { automationDepth: depth });
        applied.push(`set_priority→${action.params.priority}`);
        break;
      case "task.set_assignee":
        await setAssignee(ctx, taskId, action.params.userId, true);
        applied.push(`assign→${action.params.userId}`);
        break;
      case "task.add_comment":
        await addComment(ctx, taskId, { content: { text: action.params.text } });
        applied.push("add_comment");
        break;
    }
  }
  return applied;
}

async function logRun(ctx: TenantContext, automationId: string, status: RunStatus, log: Record<string, unknown>) {
  await forTenant(ctx, async (tx) => {
    await tx.automationRun.create({
      data: { tenantId: ctx.tenantId, automationId, status, log: log as Prisma.InputJsonValue },
    });
    if (status === "SUCCESS") {
      await tx.automation.update({ where: { id: automationId }, data: { runCount: { increment: 1 } } });
    }
  });
}

/**
 * Fire automations for a task event. `depth` is the automation-recursion depth;
 * at MAX_DEPTH the guard trips (matching rules are logged SKIPPED, not executed),
 * so a ping-pong of status rules can't loop forever.
 */
export async function dispatchTaskEvent(ctx: TenantContext, event: TaskEvent, depth = 0): Promise<void> {
  const matched = await findMatching(ctx, event);
  if (matched.length === 0) return;

  if (depth >= MAX_DEPTH) {
    for (const m of matched) await logRun(ctx, m.id, "SKIPPED", { event, loopGuarded: true, depth });
    return;
  }

  for (const m of matched) {
    try {
      const applied = await runActions(ctx, event.taskId, m.actions, depth + 1);
      await logRun(ctx, m.id, "SUCCESS", { event, actions: applied });
    } catch (err) {
      await logRun(ctx, m.id, "FAILED", { event, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
