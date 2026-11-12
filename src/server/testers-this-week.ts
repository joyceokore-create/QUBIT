import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { projectRoleCategory } from "@/lib/roles";
import { listWorkload } from "@/server/resources";

/**
 * UX fidelity Tier 1 — Quality Home › "Testers This Week" (design rail card): people who hold
 * a QA project role (QA Lead / QA Engineer) on any active project and are booked over 100%
 * over the coming fortnight. Read under the tenant's RLS; names only, no contact details.
 */
export interface TesterLoad {
  userId: string;
  name: string;
  pct: number;
  projects: number;
}

export async function testersOverbooked(ctx: TenantContext, now = new Date()): Promise<TesterLoad[]> {
  const [rows, qaMembers] = await Promise.all([
    listWorkload(ctx, now),
    withTenant(ctx, (tx) =>
      tx.projectMember.findMany({
        where: { project: { status: { notIn: ["Completed", "Cancelled"] } } },
        select: { userId: true, role: true },
      }),
    ),
  ]);
  const testers = new Set(qaMembers.filter((m) => projectRoleCategory(m.role) === "QA").map((m) => m.userId));
  return rows
    .filter((r) => testers.has(r.userId) && r.totalPct > 100)
    .map((r) => ({ userId: r.userId, name: r.name, pct: r.totalPct, projects: r.projectCount }))
    .sort((a, b) => b.pct - a.pct);
}
