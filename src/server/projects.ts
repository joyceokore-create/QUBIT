import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { avgProgress, ragCounts } from "@/server/dashboard";

const PROJECT_STATUSES = ["Planning", "OnTrack", "AtRisk", "Overdue", "Completed", "Cancelled"] as const;
const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const CreateProjectInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(["Project", "Programme"]),
  priority: z.enum(PROJECT_PRIORITIES),
  status: z.enum(PROJECT_STATUSES),
  dueDate: z.string().datetime().nullable().optional(),
  budget: z.string().nullable().optional(),
  portfolioId: z.string().uuid().nullable().optional(),
  programmeId: z.string().uuid().nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

// docs/06-api-spec.md describes updating "status/dates/owner/budget" — Project has no
// owner field in the actual schema (a doc/schema mismatch pre-dating this milestone), so
// only the fields that really exist are editable here.
export const UpdateProjectInput = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  budget: z.string().nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

export class ProjectError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  type: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  budget: string | null;
}

export interface ProjectRowSummary extends ProjectRow {
  avgProgress: number;
  orgUnits: { code: string; flag: string | null }[];
}

async function projectRowsFor(
  ctx: TenantContext,
  where: { portfolioId?: string; programmeId?: string | null },
): Promise<ProjectRowSummary[]> {
  return withTenant(ctx, async (tx) => {
    const [projects, orgUnits] = await Promise.all([
      tx.project.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          priority: true,
          status: true,
          dueDate: true,
          budget: true,
          orgStatuses: { select: { orgUnitId: true, progress: true } },
        },
        orderBy: { name: "asc" },
      }),
      tx.orgUnit.findMany({ select: { id: true, code: true, flag: true } }),
    ]);
    const orgUnitById = new Map(orgUnits.map((o) => [o.id, o]));

    return projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      priority: p.priority,
      status: p.status,
      dueDate: p.dueDate,
      budget: p.budget,
      avgProgress: avgProgress(p),
      orgUnits: p.orgStatuses
        .map((os) => orgUnitById.get(os.orgUnitId))
        .filter((o): o is { id: string; code: string; flag: string | null } => !!o)
        .map((o) => ({ code: o.code, flag: o.flag })),
    }));
  });
}

export interface ProgrammeSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  budget: string | null;
  projectCount: number;
  avgProgress: number;
  projects: ProjectRowSummary[];
}

export interface PortfolioDetail {
  id: string;
  name: string;
  description: string | null;
  budget: string | null;
  itemCount: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  avgProgress: number;
  programmes: ProgrammeSummary[];
  standaloneInPortfolio: ProjectRowSummary[];
}

export async function getPortfolioDetail(
  ctx: TenantContext,
  portfolioId: string,
): Promise<PortfolioDetail | null> {
  const portfolio = await withTenant(ctx, (tx) => tx.portfolio.findUnique({ where: { id: portfolioId } }));
  if (!portfolio) return null;

  const [allProjects, programmes] = await Promise.all([
    withTenant(ctx, (tx) =>
      tx.project.findMany({
        where: { portfolioId },
        select: { status: true, orgStatuses: { select: { progress: true } } },
      }),
    ),
    withTenant(ctx, (tx) => tx.programme.findMany({ where: { portfolioId }, orderBy: { name: "asc" } })),
  ]);

  const { onTrack, atRisk, overdue } = ragCounts(allProjects);
  const avg = allProjects.length
    ? Math.round(allProjects.reduce((sum, p) => sum + avgProgress(p), 0) / allProjects.length)
    : 0;

  const programmeSummaries: ProgrammeSummary[] = await Promise.all(
    programmes.map(async (prog) => {
      const projects = await projectRowsFor(ctx, { programmeId: prog.id });
      const progAvg = projects.length
        ? Math.round(projects.reduce((sum, p) => sum + p.avgProgress, 0) / projects.length)
        : 0;
      return {
        id: prog.id,
        name: prog.name,
        description: prog.description,
        status: prog.status,
        budget: prog.budget,
        projectCount: projects.length,
        avgProgress: progAvg,
        projects,
      };
    }),
  );

  const standaloneInPortfolio = await projectRowsFor(ctx, { portfolioId, programmeId: null });

  return {
    id: portfolio.id,
    name: portfolio.name,
    description: portfolio.description,
    budget: portfolio.targetBudget,
    itemCount: allProjects.length,
    onTrack,
    atRisk,
    overdue,
    avgProgress: avg,
    programmes: programmeSummaries,
    standaloneInPortfolio,
  };
}

export interface ProgrammePanelData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  budget: string | null;
  avgProgress: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  projects: ProjectRowSummary[];
}

export async function getProgrammePanelData(
  ctx: TenantContext,
  programmeId: string,
): Promise<ProgrammePanelData | null> {
  const programme = await withTenant(ctx, (tx) => tx.programme.findUnique({ where: { id: programmeId } }));
  if (!programme) return null;

  const projects = await projectRowsFor(ctx, { programmeId });
  const { onTrack, atRisk, overdue } = ragCounts(projects);
  const avg = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + p.avgProgress, 0) / projects.length)
    : 0;

  return {
    id: programme.id,
    name: programme.name,
    description: programme.description,
    status: programme.status,
    budget: programme.budget,
    avgProgress: avg,
    onTrack,
    atRisk,
    overdue,
    projects,
  };
}

export interface ProjectSubsidiaryDetail {
  orgUnitId: string;
  code: string;
  name: string;
  flag: string | null;
  progress: number;
  status: string;
  milestones: { name: string; state: string; sequence: number }[];
}

export interface ProjectPanelData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  budget: string | null;
  team: string | null;
  portfolioName: string | null;
  programmeName: string | null;
  avgProgress: number;
  subsidiaries: ProjectSubsidiaryDetail[];
}

export async function getProjectPanelData(
  ctx: TenantContext,
  projectId: string,
): Promise<ProjectPanelData | null> {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        portfolio: { select: { name: true } },
        programme: { select: { name: true } },
        orgStatuses: {
          include: {
            orgUnit: { select: { id: true, code: true, name: true, flag: true } },
            milestones: { orderBy: { sequence: "asc" } },
          },
        },
      },
    });
    if (!project) return null;

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      type: project.type,
      priority: project.priority,
      status: project.status,
      dueDate: project.dueDate,
      budget: project.budget,
      team: project.team,
      portfolioName: project.portfolio?.name ?? null,
      programmeName: project.programme?.name ?? null,
      avgProgress: avgProgress(project),
      subsidiaries: project.orgStatuses.map((os) => ({
        orgUnitId: os.orgUnit.id,
        code: os.orgUnit.code,
        name: os.orgUnit.name,
        flag: os.orgUnit.flag,
        progress: os.progress,
        status: os.status,
        milestones: os.milestones.map((m) => ({ name: m.name, state: m.state, sequence: m.sequence })),
      })),
    };
  });
}

export interface ProjectListFilters {
  status?: string;
  orgUnitId?: string;
  portfolioId?: string;
  q?: string;
}

export interface ProjectListItem extends ProjectRowSummary {
  portfolioId: string | null;
  programmeId: string | null;
}

export async function listProjects(
  ctx: TenantContext,
  filters: ProjectListFilters = {},
): Promise<ProjectListItem[]> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.ProjectWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.portfolioId) where.portfolioId = filters.portfolioId;
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };
    if (filters.orgUnitId) where.orgStatuses = { some: { orgUnitId: filters.orgUnitId } };

    const [projects, orgUnits] = await Promise.all([
      tx.project.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          priority: true,
          status: true,
          dueDate: true,
          budget: true,
          portfolioId: true,
          programmeId: true,
          orgStatuses: { select: { orgUnitId: true, progress: true } },
        },
        orderBy: { name: "asc" },
      }),
      tx.orgUnit.findMany({ select: { id: true, code: true, flag: true } }),
    ]);
    const orgUnitById = new Map(orgUnits.map((o) => [o.id, o]));

    return projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      priority: p.priority,
      status: p.status,
      dueDate: p.dueDate,
      budget: p.budget,
      portfolioId: p.portfolioId,
      programmeId: p.programmeId,
      avgProgress: avgProgress(p),
      orgUnits: p.orgStatuses
        .map((os) => orgUnitById.get(os.orgUnitId))
        .filter((o): o is { id: string; code: string; flag: string | null } => !!o)
        .map((o) => ({ code: o.code, flag: o.flag })),
    }));
  });
}

export async function createProject(ctx: TenantContext, input: CreateProjectInput) {
  return withTenant(ctx, async (tx) => {
    const existing = await tx.project.findUnique({
      where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
    });
    if (existing) {
      throw new ProjectError("A project with this code already exists.", "CODE_TAKEN");
    }

    const project = await tx.project.create({
      data: {
        tenantId: ctx.tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        budget: input.budget ?? null,
        portfolioId: input.portfolioId ?? null,
        programmeId: input.programmeId ?? null,
      },
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "project",
      entityId: project.id,
      after: { code: project.code, name: project.name, status: project.status },
    });

    return project;
  });
}

export async function updateProject(
  ctx: TenantContext,
  projectId: string,
  input: UpdateProjectInput,
) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.project.findUniqueOrThrow({ where: { id: projectId } });

    const after = await tx.project.update({
      where: { id: projectId },
      data: {
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        budget: input.budget === undefined ? undefined : input.budget,
      },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "project",
      entityId: projectId,
      before: { status: before.status, priority: before.priority, dueDate: before.dueDate, budget: before.budget },
      after: { status: after.status, priority: after.priority, dueDate: after.dueDate, budget: after.budget },
    });

    return after;
  });
}
