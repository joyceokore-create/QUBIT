import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { avgProgress } from "@/server/dashboard";
import { emitDomainEvent } from "@/server/events";
import { ragCounts } from "@/server/health";

const PROJECT_STATUSES = ["Planning", "OnTrack", "AtRisk", "Overdue", "Completed", "Cancelled"] as const;
const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

// PRD Module 2 definition fields, reused by create + update.
const ProjectDefinitionFields = {
  client: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  businessOwner: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
};

export const CreateProjectInput = z.object({
  // Optional since DM1.21 — the dialogs no longer ask for a code; it's auto-generated
  // from the name (initials, unique per tenant). Explicit codes remain valid (API/seed).
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(["Project", "Programme"]),
  priority: z.enum(PROJECT_PRIORITIES),
  status: z.enum(PROJECT_STATUSES),
  dueDate: z.string().datetime().nullable().optional(),
  budget: z.string().nullable().optional(),
  portfolioId: z.string().uuid().nullable().optional(),
  programmeId: z.string().uuid().nullable().optional(),
  // The project manager (Project.leadUserId). The create dialogs REQUIRE this (per Joyce:
  // every project should have a PM so join requests and escalations route somewhere);
  // optional at the schema level for API/tests back-compat. Setting it also enrols the
  // lead as a "Project Manager" member.
  leadUserId: z.string().uuid().nullable().optional(),
  ...ProjectDefinitionFields,
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

// Editable project fields. MVP1 widened this beyond status/priority/dates/budget to
// name/description and a real project lead (Project.leadUserId), so PMs can maintain
// projects fully from the UI. Per-person resourcing lives in ProjectMember (resources.ts).
export const UpdateProjectInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  budget: z.string().nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  ...ProjectDefinitionFields,
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
  client: string | null;
  objective: string | null;
  mission: string | null;
  businessOwner: string | null;
  startDate: Date | null;
  leadName: string | null;
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
        lead: { select: { name: true } },
        orgStatuses: {
          include: {
            orgUnit: { select: { id: true, code: true, name: true, flag: true } },
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
      client: project.client,
      objective: project.objective,
      mission: project.mission,
      businessOwner: project.businessOwner,
      startDate: project.startDate,
      leadName: project.lead?.name ?? null,
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

/**
 * Code base from a project name (DM1.21): initials of the first three words
 * ("Asset Valuation System" → AVS), or the first three letters of a single-word name
 * ("HomeQuest" → HOM). Codes prefix task keys (AVS-1), so they stay short and hyphen-free.
 */
export function projectCodeBase(name: string): string {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const base = (words.length >= 2 ? words.slice(0, 3).map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3))
    .replace(/[^A-Z0-9]/g, "");
  return base.length >= 2 ? base : (base + "PRJ").slice(0, 3);
}

/** First free code for the base within the tenant: AVS, then AVS2, AVS3… (RLS-scoped). */
async function nextFreeCode(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const taken = new Set(
    (await tx.project.findMany({ where: { code: { startsWith: base } }, select: { code: true } })).map((p) => p.code),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export async function createProject(ctx: TenantContext, input: CreateProjectInput) {
  // Two same-named projects created concurrently can race to the same generated code and
  // hit the tenant+code unique index — retry with a fresh suffix rather than surfacing it.
  for (let attempt = 0; ; attempt++) {
    try {
      return await createProjectOnce(ctx, input);
    } catch (e) {
      const uniqueRace =
        !input.code && attempt < 2 && typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
      if (!uniqueRace) throw e;
    }
  }
}

async function createProjectOnce(ctx: TenantContext, input: CreateProjectInput) {
  return withTenant(ctx, async (tx) => {
    const code = input.code ?? (await nextFreeCode(tx, projectCodeBase(input.name)));
    const existing = await tx.project.findUnique({
      where: { tenantId_code: { tenantId: ctx.tenantId, code } },
    });
    if (existing) {
      throw new ProjectError("A project with this code already exists.", "CODE_TAKEN");
    }

    if (input.leadUserId) {
      await tx.user.findUniqueOrThrow({ where: { id: input.leadUserId } }).catch(() => {
        throw new ProjectError("Lead user not found.", "LEAD_NOT_FOUND");
      });
    }

    const project = await tx.project.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        budget: input.budget ?? null,
        portfolioId: input.portfolioId ?? null,
        programmeId: input.programmeId ?? null,
        leadUserId: input.leadUserId ?? null,
        client: input.client ?? null,
        objective: input.objective ?? null,
        mission: input.mission ?? null,
        businessOwner: input.businessOwner ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
      },
    });

    // The lead is the project's manager — enrol them as a PM member so membership-scoped
    // checks, board lenses, and join-request notifications all see them.
    if (input.leadUserId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: input.leadUserId } },
        create: { tenantId: ctx.tenantId, projectId: project.id, userId: input.leadUserId, role: "Project Manager" },
        update: { role: "Project Manager" },
      });
    }

    await audit(tx, ctx, {
      action: "create",
      entityType: "project",
      entityId: project.id,
      after: { code: project.code, name: project.name, status: project.status, leadUserId: project.leadUserId },
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

    if (input.leadUserId) {
      // Lead must be a real user in this tenant (RLS-scoped lookup).
      await tx.user.findUniqueOrThrow({ where: { id: input.leadUserId } }).catch(() => {
        throw new ProjectError("Lead user not found.", "LEAD_NOT_FOUND");
      });
    }

    const after = await tx.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        budget: input.budget === undefined ? undefined : input.budget,
        leadUserId: input.leadUserId === undefined ? undefined : input.leadUserId,
        client: input.client === undefined ? undefined : input.client,
        objective: input.objective === undefined ? undefined : input.objective,
        mission: input.mission === undefined ? undefined : input.mission,
        businessOwner: input.businessOwner === undefined ? undefined : input.businessOwner,
        startDate:
          input.startDate === undefined ? undefined : input.startDate ? new Date(input.startDate) : null,
      },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "project",
      entityId: projectId,
      before: {
        name: before.name,
        status: before.status,
        priority: before.priority,
        dueDate: before.dueDate,
        budget: before.budget,
        leadUserId: before.leadUserId,
      },
      after: {
        name: after.name,
        status: after.status,
        priority: after.priority,
        dueDate: after.dueDate,
        budget: after.budget,
        leadUserId: after.leadUserId,
      },
    });

    if (after.status !== before.status) {
      // Feeds the dashboard delta feed ("X slipped to At Risk" / "recovered to On Track").
      await emitDomainEvent(tx, ctx, {
        type: "project.status_changed",
        entityType: "project",
        entityId: projectId,
        payload: { from: before.status, to: after.status },
      });
    }

    return after;
  });
}
