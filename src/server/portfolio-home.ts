import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { findDecisionBlockers, type DecisionBlocker } from "@/server/reports-week";
import type { PortfolioHomeExtras } from "@/lib/portfolio-home";

/**
 * UX10 — Executive › Portfolio home, the reads the cockpit payload doesn't carry. Everything
 * project-shaped (health, stage, priority, progress, red items) comes from the ONE cockpit
 * load the page already made; this adds, in one RLS-scoped transaction:
 *  - the real "Blockers needing a decision" — the SAME engine as Reports › This week for
 *    Executives (findDecisionBlockers), so the two lists can't disagree. Hidden (null) for a
 *    viewer without reports:read, as Reports itself is;
 *  - for the summary drawer, per listed project: the next three pending milestones and the
 *    latest PM-confirmed check-in line (the line the weekly roll-up carries).
 * Read-only: no writes, so nothing to audit.
 */

/** How many upcoming milestones the summary drawer lists. */
const NEXT_MILESTONES = 3;

export async function getPortfolioHomeExtras(ctx: TenantContext, projectIds: string[], now: Date): Promise<PortfolioHomeExtras> {
  const ids = [...new Set(projectIds)];
  return withTenant(ctx, async (tx) => {
    const [blockers, milestones, checkIns] = await Promise.all([
      can(ctx, "reports:read") ? findDecisionBlockers(tx, now) : Promise.resolve<DecisionBlocker[] | null>(null),
      ids.length
        ? tx.projectMilestone.findMany({
            where: { projectId: { in: ids }, status: "Pending" },
            orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { orderIndex: "asc" }],
            select: { id: true, projectId: true, name: true, dueDate: true },
          })
        : Promise.resolve([]),
      // The newest confirmed check-in with a line, one per project.
      ids.length
        ? tx.checkIn.findMany({
            where: { projectId: { in: ids }, status: "Confirmed", narrative: { not: null } },
            orderBy: [{ projectId: "asc" }, { isoWeek: "desc" }],
            distinct: ["projectId"],
            select: { projectId: true, isoWeek: true, narrative: true, confirmedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const nextMilestones: PortfolioHomeExtras["nextMilestones"] = {};
    for (const m of milestones) {
      const list = (nextMilestones[m.projectId] ??= []);
      if (list.length < NEXT_MILESTONES) list.push({ id: m.id, name: m.name, dueDate: m.dueDate?.toISOString() ?? null });
    }
    const lastLine: PortfolioHomeExtras["lastLine"] = {};
    for (const c of checkIns) {
      if (c.narrative?.trim()) lastLine[c.projectId] = { line: c.narrative.trim(), isoWeek: c.isoWeek, confirmedAt: c.confirmedAt?.toISOString() ?? null };
    }
    return { decisionBlockers: blockers, nextMilestones, lastLine };
  });
}
