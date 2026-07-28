import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { isoWeekId } from "@/lib/iso-week";
import { avgProgress } from "@/server/dashboard";
import { portfolioHealth, projectRag } from "@/server/health";
import type { JobDefinition } from "@/server/jobs/types";

/**
 * Nightly snapshots (M1, docs/16-revamp-plan.md §10): one ProjectSnapshot per project
 * and one PortfolioSnapshot per tenant per day. Feeds KPI sparklines, the delta feed,
 * M2 check-in drafts, and burnup. Upserts on the (tenant, project, day) unique key, so a
 * re-run within the same day refreshes rather than duplicates — idempotent by design.
 * Runs inside the dispatcher's tenant loop (RLS-scoped tx), machine actor audited.
 */

function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const nightlySnapshot: JobDefinition = {
  name: "nightly-snapshot",
  async run(tx: Prisma.TransactionClient, tenant) {
    const now = new Date();
    const day = utcDay(now);

    const [projects, taskAgg, blockerAgg, riskAgg, overdueAgg, allocations, escalationsOpen] = await Promise.all([
      tx.project.findMany({
        select: { id: true, status: true, orgStatuses: { select: { progress: true } } },
      }),
      tx.projectTask.groupBy({
        by: ["projectId", "status"],
        where: { approvalStatus: { not: "Draft" } },
        _count: { _all: true },
      }),
      tx.blocker.groupBy({ by: ["projectId"], where: { status: "Open" }, _count: { _all: true } }),
      tx.risk.groupBy({
        by: ["projectId"],
        where: { status: { notIn: ["Closed", "Mitigated"] } },
        _count: { _all: true },
      }),
      tx.projectTask.groupBy({
        by: ["projectId"],
        where: { approvalStatus: { not: "Draft" }, status: { not: "Completed" }, dueDate: { lt: now } },
        _count: { _all: true },
      }),
      tx.projectMember.groupBy({ by: ["userId"], _sum: { allocationPct: true } }),
      // docs/17 §2: the exec "Open escalations" KPI trend — this week's escalated nudges.
      tx.nudge.count({ where: { isoWeek: isoWeekId(now), escalationLevel: { gte: 1 } } }),
    ]);

    const openByProject = new Map<string, number>();
    const completedByProject = new Map<string, number>();
    for (const row of taskAgg) {
      const bucket = row.status === "Completed" ? completedByProject : openByProject;
      bucket.set(row.projectId, (bucket.get(row.projectId) ?? 0) + row._count._all);
    }
    const blockersByProject = new Map(blockerAgg.map((r) => [r.projectId, r._count._all]));
    const risksByProject = new Map(riskAgg.filter((r) => r.projectId).map((r) => [r.projectId as string, r._count._all]));
    const overdueByProject = new Map(overdueAgg.map((r) => [r.projectId, r._count._all]));

    for (const p of projects) {
      const snapshot = {
        status: p.status,
        rag: projectRag(p.status),
        progress: avgProgress(p),
        tasksOpen: openByProject.get(p.id) ?? 0,
        tasksCompleted: completedByProject.get(p.id) ?? 0,
        tasksOverdue: overdueByProject.get(p.id) ?? 0,
        blockersOpen: blockersByProject.get(p.id) ?? 0,
        risksOpen: risksByProject.get(p.id) ?? 0,
      };
      await tx.projectSnapshot.upsert({
        where: { tenantId_projectId_day: { tenantId: tenant.id, projectId: p.id, day } },
        create: { tenantId: tenant.id, projectId: p.id, day, ...snapshot },
        update: snapshot,
      });
    }

    const health = portfolioHealth(projects.map((p) => p.status));
    const tasksOverdue = [...overdueByProject.values()].reduce((a, b) => a + b, 0);
    const portfolio = {
      projects: health.total,
      onTrack: health.onTrack,
      needAttention: health.needAttention,
      planning: health.planning,
      onTrackPct: health.pct,
      tasksOverdue,
      peopleAllocated: allocations.length,
      peopleOverAllocated: allocations.filter((a) => (a._sum.allocationPct ?? 0) > 100).length,
      escalationsOpen,
    };
    await tx.portfolioSnapshot.upsert({
      where: { tenantId_day: { tenantId: tenant.id, day } },
      create: { tenantId: tenant.id, day, ...portfolio },
      update: portfolio,
    });

    // Machine-actor invariant (§10): jobs that write tracked data leave an audit trail.
    await audit(tx, { tenantId: tenant.id, userId: "job:nightly-snapshot" }, {
      action: "create",
      entityType: "portfolio_snapshot",
      entityId: day.toISOString().slice(0, 10),
      after: portfolio,
    });

    return { ...portfolio };
  },
};
