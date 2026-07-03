import { withTenant, type TenantContext } from "@/lib/tenant";
import { ragCounts } from "@/server/dashboard";

export interface SubsidiaryProjectRow {
  id: string;
  code: string;
  name: string;
  priority: string;
  dueDate: Date | null;
  portfolioName: string | null;
  // Status/progress are THIS subsidiary's ProjectOrgStatus values, not the project's
  // overall rollup — Screen 4 shows a project's standing at this org unit specifically.
  status: string;
  progress: number;
  orgUnits: { code: string; flag: string | null }[];
}

export interface SubsidiaryDetail {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  totalItems: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  projects: SubsidiaryProjectRow[];
}

export interface SubsidiaryProjectFilters {
  status?: string;
  q?: string;
}

export async function getSubsidiaryDetail(
  ctx: TenantContext,
  orgUnitId: string,
  filters: SubsidiaryProjectFilters = {},
): Promise<SubsidiaryDetail | null> {
  return withTenant(ctx, async (tx) => {
    const orgUnit = await tx.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!orgUnit) return null;

    const allStatuses = await tx.projectOrgStatus.findMany({
      where: { orgUnitId },
      select: { status: true },
    });
    const { onTrack, atRisk, overdue } = ragCounts(allStatuses);

    const statuses = await tx.projectOrgStatus.findMany({
      where: {
        orgUnitId,
        status: filters.status || undefined,
        project: filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : undefined,
      },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            priority: true,
            dueDate: true,
            portfolio: { select: { name: true } },
            orgStatuses: { select: { orgUnit: { select: { code: true, flag: true } } } },
          },
        },
      },
      orderBy: { project: { name: "asc" } },
    });

    return {
      id: orgUnit.id,
      code: orgUnit.code,
      name: orgUnit.name,
      flag: orgUnit.flag,
      totalItems: allStatuses.length,
      onTrack,
      atRisk,
      overdue,
      projects: statuses.map((os) => ({
        id: os.project.id,
        code: os.project.code,
        name: os.project.name,
        priority: os.project.priority,
        dueDate: os.project.dueDate,
        portfolioName: os.project.portfolio?.name ?? null,
        status: os.status,
        progress: os.progress,
        orgUnits: os.project.orgStatuses.map((o) => ({ code: o.orgUnit.code, flag: o.orgUnit.flag })),
      })),
    };
  });
}
