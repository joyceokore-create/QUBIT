import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * Milestone A — the workspace's "Register (N)" tab badge: how many register items are
 * still open on a project. Blockers (Open), risks (anything but Closed) and issues
 * (anything but Resolved/Closed). Dependencies, decisions and lessons are records, not
 * open work, so they don't count. One number, tenant-scoped, read on page load.
 */
export async function registerOpenCountTx(tx: Prisma.TransactionClient, projectId: string): Promise<number> {
  const [blockers, risks, issues] = await Promise.all([
    tx.blocker.count({ where: { projectId, status: "Open" } }),
    tx.risk.count({ where: { projectId, status: { not: "Closed" } } }),
    tx.issue.count({ where: { projectId, status: { notIn: ["Resolved", "Closed"] } } }),
  ]);
  return blockers + risks + issues;
}

export async function registerOpenCount(ctx: TenantContext, projectId: string): Promise<number> {
  return withTenant(ctx, (tx) => registerOpenCountTx(tx, projectId));
}
