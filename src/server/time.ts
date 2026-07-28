import type { TenantContext } from "@/lib/tenant";
import { forTenant } from "@/server/tenant-db";

/**
 * Time report (read-only). The ClickUp timer surface was removed in the M0 cull
 * (docs/16-revamp-plan.md §2); existing TimeEntry rows still report here until
 * M6 retargets TimeEntry at ProjectTask and time capture returns.
 */

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
