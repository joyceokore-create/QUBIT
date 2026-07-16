import type { Prisma, Priority, DependencyType } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { resolveStatusGroupId } from "@/server/hierarchy";
import { ORDER_STEP } from "@/server/ordering";
import { ConflictError, NotFoundError, UnprocessableError } from "@/server/errors";

/**
 * Task CRUD core (04-module-specs §2). Multi-assignee, per-tenant human `seq`
 * ("QBT-1042"), soft delete, fractional ordering. Every mutation records Activity
 * + realtime. The full task panel (checklists, comments, dependencies, attachments,
 * custom fields) builds on this in later Phase 1 increments.
 */

const taskInclude = {
  status: true,
  assignees: { select: { userId: true } },
  watchers: { select: { userId: true } },
  tags: { select: { tagId: true } },
} satisfies Prisma.TaskInclude;

// A related task as shown in the subtask/dependency lists.
const relatedTaskSelect = { id: true, seq: true, name: true, statusId: true } satisfies Prisma.TaskSelect;

// Full detail for the task panel: light fields + people (with names) + tags (with
// name/colour) + subtasks + both dependency directions + the owning space id.
const taskDetailInclude = {
  status: true,
  list: { select: { spaceId: true } },
  assignees: { select: { userId: true, user: { select: { name: true } } } },
  watchers: { select: { userId: true, user: { select: { name: true } } } },
  tags: { select: { tagId: true, tag: { select: { name: true, colorToken: true } } } },
  children: {
    where: { deletedAt: null },
    select: { ...relatedTaskSelect, status: true },
    orderBy: { orderIndex: "asc" },
  },
  dependencies: { include: { to: { select: relatedTaskSelect } } }, // this task blocks →
  dependents: { include: { from: { select: relatedTaskSelect } } }, // ← blocked by this task's blockers
} satisfies Prisma.TaskInclude;

async function nextSeq(tx: Prisma.TransactionClient): Promise<number> {
  // Per-tenant human id. A transaction-scoped advisory lock keyed on the tenant
  // serializes concurrent seq issuance (max+1 would otherwise race two creates to
  // the same number and trip @@unique([tenantId, seq])). Auto-released at commit.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('task_seq:' || current_setting('app.tenant_id', true)))`;
  const agg = await tx.task.aggregate({ _max: { seq: true } });
  return (agg._max.seq ?? 0) + 1;
}

async function nextTaskOrder(tx: Prisma.TransactionClient, listId: string): Promise<number> {
  const last = await tx.task.findFirst({
    where: { listId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}

/** Resolve the status to use: explicit (validated) or the list's first status. */
async function resolveInitialStatus(
  tx: Prisma.TransactionClient,
  listId: string,
  statusId?: string,
): Promise<string> {
  if (statusId) {
    assertFound(await tx.status.findUnique({ where: { id: statusId }, select: { id: true } }), "Status not found.");
    return statusId;
  }
  const groupId = await resolveStatusGroupId(tx, listId);
  if (!groupId) throw new UnprocessableError("List has no status group — attach one before adding tasks.");
  const first = await tx.status.findFirst({
    where: { statusGroupId: groupId },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });
  if (!first) throw new UnprocessableError("Status group has no statuses.");
  return first.id;
}

export async function createTask(
  ctx: TenantContext,
  input: {
    listId: string;
    name: string;
    statusId?: string;
    priority?: Priority;
    parentId?: string;
    startDate?: Date;
    dueDate?: Date;
    isMilestone?: boolean;
    timeEstimate?: number;
    assigneeIds?: string[];
    tagIds?: string[];
  },
  opts?: { automationDepth?: number },
) {
  const created = await forTenant(ctx, async (tx) => {
    assertFound(await tx.list.findUnique({ where: { id: input.listId }, select: { id: true } }), "List not found.");
    if (input.parentId) {
      assertFound(
        await tx.task.findUnique({ where: { id: input.parentId }, select: { id: true } }),
        "Parent task not found.",
      );
    }
    const statusId = await resolveInitialStatus(tx, input.listId, input.statusId);

    const task = await tx.task.create({
      data: {
        tenantId: ctx.tenantId,
        listId: input.listId,
        parentId: input.parentId ?? null,
        name: input.name,
        statusId,
        priority: input.priority ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        isMilestone: input.isMilestone ?? false,
        timeEstimate: input.timeEstimate ?? null,
        orderIndex: await nextTaskOrder(tx, input.listId),
        createdById: ctx.userId,
        seq: await nextSeq(tx),
      },
    });

    if (input.assigneeIds?.length) {
      await tx.taskAssignee.createMany({
        data: input.assigneeIds.map((userId) => ({ tenantId: ctx.tenantId, taskId: task.id, userId })),
        skipDuplicates: true,
      });
    }
    if (input.tagIds?.length) {
      await tx.taskTag.createMany({
        data: input.tagIds.map((tagId) => ({ tenantId: ctx.tenantId, taskId: task.id, tagId })),
        skipDuplicates: true,
      });
    }

    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: task.id,
      verb: "task.created",
      data: { name: task.name, listId: task.listId, seq: task.seq },
    });
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
  });

  // Fire task.created automations after commit (depth-guarded).
  const { dispatchTaskEvent } = await import("@/server/automations");
  await dispatchTaskEvent(ctx, { type: "task.created", taskId: created.id }, opts?.automationDepth ?? 0);
  return created;
}

export async function getTask(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({ where: { id, deletedAt: null }, include: taskDetailInclude });
    return assertFound(task, "Task not found.");
  });
}

export async function getTaskBySeq(ctx: TenantContext, seq: number) {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({ where: { seq, deletedAt: null }, include: taskInclude });
    return assertFound(task, "Task not found.");
  });
}

export async function listTasks(ctx: TenantContext, listId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.list.findUnique({ where: { id: listId }, select: { id: true } }), "List not found.");
    return tx.task.findMany({
      where: { listId, deletedAt: null, parentId: null },
      include: taskInclude,
      orderBy: { orderIndex: "asc" },
    });
  });
}

export async function updateTask(
  ctx: TenantContext,
  id: string,
  patch: Partial<{
    name: string;
    statusId: string;
    priority: Priority | null;
    startDate: Date | null;
    dueDate: Date | null;
    isMilestone: boolean;
    timeEstimate: number | null;
    description: Record<string, unknown>;
    archived: boolean;
  }>,
  opts?: { automationDepth?: number },
) {
  const result = await forTenant(ctx, async (tx) => {
    const before = await tx.task.findFirst({ where: { id, deletedAt: null }, select: { id: true, statusId: true } });
    if (!before) throw new NotFoundError("Task not found.");
    if (patch.statusId) {
      assertFound(
        await tx.status.findUnique({ where: { id: patch.statusId }, select: { id: true } }),
        "Status not found.",
      );
    }

    // description is opaque editor JSON — cast to Prisma's JSON input type.
    const { description, ...rest } = patch;
    const task = await tx.task.update({
      where: { id },
      data: {
        ...rest,
        ...(description !== undefined && { description: description as Prisma.InputJsonValue }),
      },
      include: taskInclude,
    });

    // Status changes get their own verb (automations/heatmaps key off it).
    if (patch.statusId && patch.statusId !== before.statusId) {
      await recordActivity(tx, ctx, {
        objectType: "task",
        objectId: id,
        verb: "task.status_changed",
        data: { from: before.statusId, to: patch.statusId },
      });
    }
    const otherFields = Object.keys(patch).filter((k) => k !== "statusId");
    if (otherFields.length) {
      await recordActivity(tx, ctx, {
        objectType: "task",
        objectId: id,
        verb: patch.archived === true ? "task.archived" : "task.updated",
        data: { fields: otherFields },
      });
    }
    const statusChanged = Boolean(patch.statusId && patch.statusId !== before.statusId);
    return { task, statusChanged, newStatusId: patch.statusId };
  });

  // Fire status-change automations after commit (fresh transactions; depth-guarded).
  if (result.statusChanged) {
    const { dispatchTaskEvent } = await import("@/server/automations");
    await dispatchTaskEvent(
      ctx,
      { type: "task.status_changed", taskId: id, toStatusId: result.newStatusId },
      opts?.automationDepth ?? 0,
    );
  }
  return result.task;
}

/** Soft-delete (recoverable). Hard delete happens via a purge job later. */
export async function deleteTask(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!task) throw new NotFoundError("Task not found.");
    await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordActivity(tx, ctx, { objectType: "task", objectId: id, verb: "task.deleted" });
    return { id };
  });
}

/** Move a task to another list (placed at the end). */
export async function moveTask(ctx: TenantContext, id: string, listId: string) {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({ where: { id, deletedAt: null }, select: { id: true, listId: true } });
    if (!task) throw new NotFoundError("Task not found.");
    assertFound(await tx.list.findUnique({ where: { id: listId }, select: { id: true } }), "List not found.");
    const moved = await tx.task.update({
      where: { id },
      data: { listId, orderIndex: await nextTaskOrder(tx, listId) },
      include: taskInclude,
    });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: id,
      verb: "task.moved",
      data: { from: task.listId, to: listId },
    });
    return moved;
  });
}

// ── Assignees / watchers / tags ──────────────────────────────────────────────

async function assertTask(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const task = await tx.task.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found.");
}

export async function setAssignee(ctx: TenantContext, taskId: string, userId: string, assigned: boolean) {
  return forTenant(ctx, async (tx) => {
    await assertTask(tx, taskId);
    if (assigned) {
      await tx.taskAssignee.upsert({
        where: { taskId_userId: { taskId, userId } },
        create: { tenantId: ctx.tenantId, taskId, userId },
        update: {},
      });
    } else {
      await tx.taskAssignee.deleteMany({ where: { taskId, userId } });
    }
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: taskId,
      verb: assigned ? "task.assignee_added" : "task.assignee_removed",
      data: { userId },
    });
    return { taskId, userId, assigned };
  });
}

export async function setWatcher(ctx: TenantContext, taskId: string, userId: string, watching: boolean) {
  return forTenant(ctx, async (tx) => {
    await assertTask(tx, taskId);
    if (watching) {
      await tx.taskWatcher.upsert({
        where: { taskId_userId: { taskId, userId } },
        create: { tenantId: ctx.tenantId, taskId, userId },
        update: {},
      });
    } else {
      await tx.taskWatcher.deleteMany({ where: { taskId, userId } });
    }
    return { taskId, userId, watching };
  });
}

export async function setTag(ctx: TenantContext, taskId: string, tagId: string, tagged: boolean) {
  return forTenant(ctx, async (tx) => {
    await assertTask(tx, taskId);
    if (tagged) {
      assertFound(await tx.tag.findUnique({ where: { id: tagId }, select: { id: true } }), "Tag not found.");
      await tx.taskTag.upsert({
        where: { taskId_tagId: { taskId, tagId } },
        create: { tenantId: ctx.tenantId, taskId, tagId },
        update: {},
      });
    } else {
      await tx.taskTag.deleteMany({ where: { taskId, tagId } });
    }
    return { taskId, tagId, tagged };
  });
}

// ── Subtasks ─────────────────────────────────────────────────────────────────

/** Create a subtask under `parentId` (inherits the parent's list). */
export async function createSubtask(
  ctx: TenantContext,
  parentId: string,
  input: { name: string; statusId?: string; priority?: Priority; assigneeIds?: string[] },
) {
  const parent = await forTenant(ctx, (tx) =>
    tx.task.findFirst({ where: { id: parentId, deletedAt: null }, select: { listId: true } }),
  );
  if (!parent) throw new NotFoundError("Parent task not found.");
  return createTask(ctx, { ...input, listId: parent.listId, parentId });
}

/**
 * Re-parent a task (promote to top-level with null, or demote under another task).
 * Rejects self-parenting and any move that would put a task under its own descendant.
 */
export async function setParent(ctx: TenantContext, taskId: string, parentId: string | null) {
  return forTenant(ctx, async (tx) => {
    await assertTask(tx, taskId);
    if (parentId) {
      if (parentId === taskId) throw new UnprocessableError("A task can't be its own parent.");
      await assertTask(tx, parentId);
      // Walk the prospective parent's ancestry; if we hit taskId, this creates a cycle.
      let cursor: string | null = parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === taskId) throw new UnprocessableError("That move would nest a task under itself.");
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const node: { parentId: string | null } | null = await tx.task.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = node?.parentId ?? null;
      }
    }
    const task = await tx.task.update({ where: { id: taskId }, data: { parentId }, include: taskInclude });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: taskId,
      verb: parentId ? "task.demoted" : "task.promoted",
      data: { parentId },
    });
    return task;
  });
}

// ── Dependencies (with cycle detection) ──────────────────────────────────────

/**
 * Add a dependency edge. BLOCKS/WAITING_ON are directed (blocker `from` → blocked
 * `to`) and must not form a cycle; LINKED is a non-directional reference. Rejects
 * self-links (422), duplicates (409), and cycles (422).
 */
export async function addDependency(
  ctx: TenantContext,
  input: { fromId: string; toId: string; type: DependencyType },
) {
  const { fromId, toId, type } = input;
  return forTenant(ctx, async (tx) => {
    if (fromId === toId) throw new UnprocessableError("A task can't depend on itself.");
    const [from, to] = await Promise.all([
      tx.task.findFirst({ where: { id: fromId, deletedAt: null }, select: { id: true } }),
      tx.task.findFirst({ where: { id: toId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!from || !to) throw new NotFoundError("Task not found.");

    const existing = await tx.taskDependency.findFirst({ where: { fromId, toId, type }, select: { id: true } });
    if (existing) throw new ConflictError("That dependency already exists.");

    if (type !== "LINKED") {
      // Adding from→to closes a cycle iff `to` can already reach `from` in the
      // directed blocking graph. BFS over BLOCKS/WAITING_ON edges from `to`.
      const edges = await tx.taskDependency.findMany({
        where: { type: { in: ["BLOCKS", "WAITING_ON"] } },
        select: { fromId: true, toId: true },
      });
      const adj = new Map<string, string[]>();
      for (const e of edges) {
        const list = adj.get(e.fromId) ?? adj.set(e.fromId, []).get(e.fromId)!;
        list.push(e.toId);
      }
      const seen = new Set<string>([toId]);
      const queue = [toId];
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur === fromId) throw new UnprocessableError("That dependency would create a cycle.");
        for (const next of adj.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }

    const dep = await tx.taskDependency.create({ data: { tenantId: ctx.tenantId, fromId, toId, type } });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: toId,
      verb: "task.dependency_added",
      data: { fromId, toId, type },
    });
    return dep;
  });
}

export async function removeDependency(ctx: TenantContext, depId: string) {
  return forTenant(ctx, async (tx) => {
    const dep = await tx.taskDependency.findUnique({ where: { id: depId } });
    if (!dep) throw new NotFoundError("Dependency not found.");
    await tx.taskDependency.delete({ where: { id: depId } });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: dep.toId,
      verb: "task.dependency_removed",
      data: { fromId: dep.fromId, toId: dep.toId, type: dep.type },
    });
    return { id: depId };
  });
}
