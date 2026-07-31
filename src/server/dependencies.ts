import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Task dependencies (docs/16 §12 M7). "This task is waiting on that one."
 *
 * The load-bearing rule is that the graph must stay ACYCLIC: a loop is a set of tasks
 * none of which can ever start, and it would make any future scheduling or critical-path
 * work meaningless. Cycles are therefore refused at write time, walking the existing
 * edges — not left for a report to notice later.
 */

export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

/**
 * Would adding `taskId → dependsOnTaskId` create a cycle? True when the proposed
 * dependency is already reachable FROM the target — i.e. the target already waits on
 * this task, directly or through a chain. Pure, so the graph logic is unit-testable.
 */
export function wouldCycle(edges: DependencyEdge[], taskId: string, dependsOnTaskId: string): boolean {
  if (taskId === dependsOnTaskId) return true; // a task cannot wait on itself
  // Adjacency: task → the tasks it waits on.
  const waitsOn = new Map<string, string[]>();
  for (const e of edges) {
    const list = waitsOn.get(e.taskId) ?? [];
    list.push(e.dependsOnTaskId);
    waitsOn.set(e.taskId, list);
  }
  // Walk out from the proposed dependency: if we can reach taskId, the new edge closes
  // a loop.
  const seen = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(waitsOn.get(current) ?? []));
  }
  return false;
}

export interface WaitingOn {
  taskId: string;
  title: string;
  taskKey: string | null;
  status: string;
  /** False once the blocker is Completed — the wait is over. */
  blocking: boolean;
}

export class DependencyError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT" | "CYCLE",
  ) {
    super(message);
    this.name = "DependencyError";
  }
}

export const DependencyInput = z.object({ dependsOnTaskId: z.string().uuid() });

/** Declare that `taskId` waits on `dependsOnTaskId`. Same project only, no cycles. */
export async function addDependency(
  ctx: TenantContext,
  taskId: string,
  dependsOnTaskId: string,
): Promise<WaitingOn[]> {
  await withTenant(ctx, async (tx) => {
    if (taskId === dependsOnTaskId) {
      throw new DependencyError("A task cannot wait on itself.", "BAD_INPUT");
    }
    const [task, dep] = await Promise.all([
      tx.projectTask.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } }),
      tx.projectTask.findUnique({ where: { id: dependsOnTaskId }, select: { id: true, projectId: true, title: true } }),
    ]);
    if (!task || !dep) throw new DependencyError("Task not found.", "NOT_FOUND");
    // Cross-project dependencies are refused: they hide coupling the portfolio view
    // cannot show, and every scheduling question they raise is a programme question.
    if (task.projectId !== dep.projectId) {
      throw new DependencyError("Both tasks must be on the same project.", "BAD_INPUT");
    }

    const edges = await tx.projectTaskDependency.findMany({
      where: { task: { projectId: task.projectId } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    if (wouldCycle(edges, taskId, dependsOnTaskId)) {
      throw new DependencyError(
        `That would create a loop — ${dep.title} already waits on this task, directly or through a chain.`,
        "CYCLE",
      );
    }

    await tx.projectTaskDependency.upsert({
      where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } },
      create: { tenantId: ctx.tenantId, taskId, dependsOnTaskId, createdById: ctx.userId },
      update: {},
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_task",
      entityId: taskId,
      after: { dependsOn: dependsOnTaskId },
    });
  });
  return listWaitingOn(ctx, taskId);
}

export async function removeDependency(ctx: TenantContext, taskId: string, dependsOnTaskId: string): Promise<WaitingOn[]> {
  await withTenant(ctx, async (tx) => {
    await tx.projectTaskDependency.deleteMany({ where: { taskId, dependsOnTaskId } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_task",
      entityId: taskId,
      before: { dependsOn: dependsOnTaskId },
    });
  });
  return listWaitingOn(ctx, taskId);
}

/** What this task is waiting on, and whether each is still blocking. */
export async function listWaitingOn(ctx: TenantContext, taskId: string): Promise<WaitingOn[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTaskDependency.findMany({
      where: { taskId },
      select: { dependsOnTask: { select: { id: true, title: true, taskKey: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      taskId: r.dependsOnTask.id,
      title: r.dependsOnTask.title,
      taskKey: r.dependsOnTask.taskKey,
      status: r.dependsOnTask.status,
      blocking: r.dependsOnTask.status !== "Completed",
    }));
  });
}

/** taskId → number of INCOMPLETE dependencies, for a whole project. Feeds the board's
 * "waiting on N" badge without a query per card. */
export async function waitingCountByTask(ctx: TenantContext, projectId: string): Promise<Map<string, number>> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTaskDependency.findMany({
      where: { task: { projectId } },
      select: { taskId: true, dependsOnTask: { select: { status: true } } },
    });
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.dependsOnTask.status === "Completed") continue;
      out.set(r.taskId, (out.get(r.taskId) ?? 0) + 1);
    }
    return out;
  });
}
