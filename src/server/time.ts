import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { ConflictError, NotFoundError } from "@/server/errors";

/**
 * Time tracking (04-module-specs §13). One running timer per user (enforced),
 * duration derived on stop, plus manual entries and a report roll-up. Entries are
 * per-user; RLS scopes everything to the tenant.
 */

const minutesBetween = (start: Date, end: Date) => Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

/** The caller's currently running timer (end = null), or null. */
export async function getRunningTimer(ctx: TenantContext) {
  return forTenant(ctx, (tx) =>
    tx.timeEntry.findFirst({
      where: { userId: ctx.userId, end: null },
      include: { task: { select: { id: true, seq: true, name: true } } },
    }),
  );
}

/** Start a timer on a task. Rejects (409) if the user already has one running. */
export async function startTimer(ctx: TenantContext, taskId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    const running = await tx.timeEntry.findFirst({ where: { userId: ctx.userId, end: null }, select: { id: true } });
    if (running) throw new ConflictError("A timer is already running. Stop it before starting another.");
    const entry = await tx.timeEntry.create({
      data: { tenantId: ctx.tenantId, taskId, userId: ctx.userId, start: new Date() },
    });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "time.started" });
    return entry;
  });
}

/** Stop the caller's running timer (on a given entry, or whichever is running). */
export async function stopTimer(ctx: TenantContext, entryId?: string) {
  return forTenant(ctx, async (tx) => {
    const running = await tx.timeEntry.findFirst({
      where: { userId: ctx.userId, end: null, ...(entryId ? { id: entryId } : {}) },
    });
    if (!running) throw new NotFoundError("No running timer.");
    const end = new Date();
    const entry = await tx.timeEntry.update({
      where: { id: running.id },
      data: { end, durationMin: minutesBetween(running.start, end) },
    });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: running.taskId,
      verb: "time.stopped",
      data: { durationMin: entry.durationMin },
    });
    return entry;
  });
}

/** Add a completed (manual) entry with an explicit duration. */
export async function addManualEntry(
  ctx: TenantContext,
  taskId: string,
  input: { durationMin: number; start?: Date; note?: string; billable?: boolean },
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    const start = input.start ?? new Date();
    const end = new Date(start.getTime() + input.durationMin * 60000);
    const entry = await tx.timeEntry.create({
      data: {
        tenantId: ctx.tenantId,
        taskId,
        userId: ctx.userId,
        start,
        end,
        durationMin: input.durationMin,
        note: input.note ?? null,
        billable: input.billable ?? false,
      },
    });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "time.logged", data: { durationMin: input.durationMin } });
    return entry;
  });
}

export async function deleteEntry(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const entry = await tx.timeEntry.findUnique({ where: { id }, select: { id: true } });
    if (!entry) throw new NotFoundError("Entry not found.");
    await tx.timeEntry.delete({ where: { id } });
    return { id };
  });
}

/** Entries for a task (all users) + the total tracked minutes. */
export async function listTaskEntries(ctx: TenantContext, taskId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    const entries = await tx.timeEntry.findMany({ where: { taskId }, orderBy: { start: "desc" } });
    const totalMin = entries.reduce((n, e) => n + (e.durationMin ?? 0), 0);
    return { entries, totalMin };
  });
}

export interface TimeReportRow {
  taskId: string;
  taskSeq: number;
  taskName: string;
  totalMin: number;
  billableMin: number;
}

/** Report: completed entries in [from, to) rolled up per task (optionally per user). */
export async function timeReport(
  ctx: TenantContext,
  opts: { from: Date; to: Date; userId?: string },
): Promise<{ rows: TimeReportRow[]; totalMin: number }> {
  return forTenant(ctx, async (tx) => {
    const entries = await tx.timeEntry.findMany({
      where: {
        start: { gte: opts.from, lt: opts.to },
        end: { not: null },
        ...(opts.userId ? { userId: opts.userId } : {}),
      },
      include: { task: { select: { seq: true, name: true } } },
    });
    const byTask = new Map<string, TimeReportRow>();
    let totalMin = 0;
    for (const e of entries) {
      const min = e.durationMin ?? 0;
      totalMin += min;
      const row = byTask.get(e.taskId) ?? {
        taskId: e.taskId,
        taskSeq: e.task.seq,
        taskName: e.task.name,
        totalMin: 0,
        billableMin: 0,
      };
      row.totalMin += min;
      if (e.billable) row.billableMin += min;
      byTask.set(e.taskId, row);
    }
    const rows = [...byTask.values()].sort((a, b) => b.totalMin - a.totalMin);
    return { rows, totalMin };
  });
}
