import { withTenant, type TenantContext } from "@/lib/tenant";

export interface SidebarPortfolio {
  id: string;
  name: string;
  itemCount: number;
}

export interface SidebarOrgUnit {
  id: string;
  code: string;
  name: string;
  flag: string | null;
}

export interface SidebarNavData {
  portfolios: SidebarPortfolio[];
  orgUnits: SidebarOrgUnit[];
  standaloneCount: number;
  openRaidCount: number;
}

/** Lightweight nav-only data for the sidebar — full dashboard rollups land in Milestone 4. */
export async function getSidebarNavData(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
): Promise<SidebarNavData> {
  return withTenant(ctx, async (tx) => {
    const [portfolios, orgUnits, standaloneCount, openRiskCount, openIssueCount, projectCounts] =
      await Promise.all([
        tx.portfolio.findMany({ orderBy: { name: "asc" } }),
        tx.orgUnit.findMany({ orderBy: { code: "asc" } }),
        tx.project.count({ where: { portfolioId: null } }),
        tx.risk.count({ where: { status: { not: "Closed" } } }),
        tx.issue.count({ where: { status: { not: "Closed" } } }),
        tx.project.groupBy({
          by: ["portfolioId"],
          _count: { _all: true },
          where: { portfolioId: { not: null } },
        }),
      ]);

    const countByPortfolioId = new Map(
      projectCounts.map((row) => [row.portfolioId as string, row._count._all]),
    );

    return {
      portfolios: portfolios.map((p) => ({
        id: p.id,
        name: p.name,
        itemCount: countByPortfolioId.get(p.id) ?? 0,
      })),
      orgUnits: orgUnits.map((o) => ({ id: o.id, code: o.code, name: o.name, flag: o.flag })),
      standaloneCount,
      openRaidCount: openRiskCount + openIssueCount,
    };
  });
}
