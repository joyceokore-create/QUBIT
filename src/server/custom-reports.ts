import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { taskVisibleTo, type LensTask } from "@/lib/board-lens";
import { projectRoleCategory, type ProjectRoleCategory } from "@/lib/roles";
import {
  reportDataset,
  type ReportDatasetKey,
} from "@/lib/report-catalogue";
import { ownerNamesById } from "@/server/raid-shared";
import { listRisks } from "@/server/risks";
import { listIssues } from "@/server/issues";
import { listWorkload } from "@/server/resources";

// Custom Reports engine — binds each dataset in src/lib/report-catalogue.ts to a
// tenant-scoped row builder. Requested column keys are validated against the registry
// allow-list and only ever used to PICK from rows the builder produced — they are never
// interpolated into a query, so an invented key can select nothing.

export type ReportCell = string | number | boolean | Date | null;
export type ReportRow = Record<string, ReportCell>;

export class CustomReportError extends Error {
  code: string;
  constructor(message: string, code = "VALIDATION") {
    super(message);
    this.code = code;
  }
}

/**
 * Route-level permission per dataset (mirrors /api/export's per-kind gates — singular
 * catalogue codes, NOT a `${module}:read` convention, because not every module has a
 * read permission). `null` = any signed-in user; the builder then scopes ROWS itself
 * (workload: own row only without report:resource:others).
 */
export const DATASET_PERMISSION: Record<ReportDatasetKey, string | null> = {
  projects: "project:read",
  portfolios: "portfolio:read",
  programmes: "programme:read",
  risks: "risk:read",
  issues: "issue:read",
  tasks: "task:read",
  workload: null,
};

/** Datasets this viewer may run — drives which options the builder offers. */
export function allowedDatasetKeys(ctx: TenantContext): ReportDatasetKey[] {
  return (Object.keys(DATASET_PERMISSION) as ReportDatasetKey[]).filter((k) => {
    const perm = DATASET_PERMISSION[k];
    return perm === null || can(ctx, perm);
  });
}

async function projectRows(ctx: TenantContext): Promise<ReportRow[]> {
  return withTenant(ctx, async (tx) => {
    const [projects, orgUnits] = await Promise.all([
      tx.project.findMany({
        select: {
          code: true,
          name: true,
          description: true,
          client: true,
          businessOwner: true,
          type: true,
          status: true,
          priority: true,
          pipelineStage: true,
          startDate: true,
          dueDate: true,
          budget: true,
          statusNote: true,
          createdAt: true,
          portfolio: { select: { name: true } },
          programme: { select: { name: true } },
          lead: { select: { name: true } },
          orgStatuses: { select: { orgUnitId: true } },
        },
        orderBy: { name: "asc" },
      }),
      tx.orgUnit.findMany({ select: { id: true, code: true } }),
    ]);
    const unitCode = new Map(orgUnits.map((o) => [o.id, o.code]));
    return projects.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      client: p.client,
      businessOwner: p.businessOwner,
      type: p.type,
      status: p.status,
      priority: p.priority,
      pipelineStage: p.pipelineStage,
      portfolio: p.portfolio?.name ?? null,
      programme: p.programme?.name ?? null,
      lead: p.lead?.name ?? null,
      startDate: p.startDate,
      dueDate: p.dueDate,
      budget: p.budget,
      statusNote: p.statusNote,
      markets: p.orgStatuses.map((s) => unitCode.get(s.orgUnitId)).filter(Boolean).join(", ") || null,
      createdAt: p.createdAt,
    }));
  });
}

async function portfolioRows(ctx: TenantContext): Promise<ReportRow[]> {
  return withTenant(ctx, async (tx) => {
    const portfolios = await tx.portfolio.findMany({
      select: {
        name: true,
        description: true,
        category: true,
        viewKind: true,
        ownerId: true,
        targetBudget: true,
        createdAt: true,
        _count: { select: { programmes: true, projects: true } },
      },
      orderBy: { name: "asc" },
    });
    // Portfolio.ownerId is a bare string with no FK (same convention as Risk/Issue).
    const owners = await ownerNamesById(tx, portfolios.map((p) => p.ownerId));
    return portfolios.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      viewKind: p.viewKind,
      owner: p.ownerId ? (owners.get(p.ownerId) ?? "Unknown") : null,
      targetBudget: p.targetBudget,
      programmes: p._count.programmes,
      projects: p._count.projects,
      createdAt: p.createdAt,
    }));
  });
}

async function programmeRows(ctx: TenantContext): Promise<ReportRow[]> {
  return withTenant(ctx, async (tx) => {
    const programmes = await tx.programme.findMany({
      select: {
        name: true,
        description: true,
        status: true,
        category: true,
        budget: true,
        createdAt: true,
        portfolio: { select: { name: true } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
    });
    return programmes.map((p) => ({
      name: p.name,
      description: p.description,
      status: p.status,
      category: p.category,
      portfolio: p.portfolio?.name ?? null,
      budget: p.budget,
      projects: p._count.projects,
      createdAt: p.createdAt,
    }));
  });
}

async function riskRows(ctx: TenantContext): Promise<ReportRow[]> {
  const risks = await listRisks(ctx);
  return risks.map((r) => ({
    title: r.title,
    project: r.projectCode,
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    score: r.probability * r.impact,
    status: r.status,
    owner: r.ownerName,
    mitigation: r.mitigation,
    materialised: r.materialised,
    createdAt: r.createdAt,
  }));
}

async function issueRows(ctx: TenantContext): Promise<ReportRow[]> {
  const issues = await listIssues(ctx);
  return issues.map((i) => ({
    title: i.title,
    project: i.projectCode,
    severity: i.severity,
    status: i.status,
    owner: i.ownerName,
    originRisk: i.originRiskTitle,
    createdAt: i.createdAt,
  }));
}

/**
 * Tenant-wide task rows behind the DM1.43 board wall, applied in bulk: the viewer's
 * per-project role category decides which lanes they may see (their own tasks always),
 * exactly as on the boards — and Draft tasks never appear in reports at all.
 */
async function taskRows(ctx: TenantContext): Promise<ReportRow[]> {
  // Tenant-wide project:write (PlatformSuperAdmin, HeadOfProjects) = PM on every board;
  // project-independent, so checked once (canWriteProject's other half is per-project).
  const tenantPm = can(ctx, "project:write");

  const { tasks, memberships, leads } = await withTenant(ctx, async (tx) => {
    const [tasks, memberships, leads] = await Promise.all([
      tx.projectTask.findMany({
        where: { approvalStatus: "Published" },
        select: {
          taskKey: true,
          externalKey: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          severity: true,
          phase: true,
          estimate: true,
          dueDate: true,
          lastActivityAt: true,
          sourceSystem: true,
          assigneeId: true,
          externalAssigneeName: true,
          assignee: { select: { name: true } },
          milestone: { select: { name: true } },
          project: { select: { id: true, code: true } },
        },
        orderBy: { lastActivityAt: "desc" },
      }),
      tx.projectMember.findMany({ select: { projectId: true, userId: true, role: true } }),
      tx.project.findMany({ select: { id: true, leadUserId: true } }),
    ]);
    return { tasks, memberships, leads };
  });

  const leadByProject = new Map(leads.map((p) => [p.id, p.leadUserId]));
  const categoryByProjectUser = new Map<string, ProjectRoleCategory>();
  for (const m of memberships) categoryByProjectUser.set(`${m.projectId}:${m.userId}`, projectRoleCategory(m.role));
  for (const p of leads) if (p.leadUserId) categoryByProjectUser.set(`${p.id}:${p.leadUserId}`, "PM");

  const viewerCategory = (projectId: string): ProjectRoleCategory => {
    if (tenantPm || leadByProject.get(projectId) === ctx.userId) return "PM";
    return categoryByProjectUser.get(`${projectId}:${ctx.userId}`) ?? "Stakeholder";
  };

  return tasks
    .filter((t) => {
      const lens: LensTask = {
        type: t.type,
        status: t.status,
        assigneeId: t.assigneeId,
        assigneeCategory: t.assigneeId ? (categoryByProjectUser.get(`${t.project.id}:${t.assigneeId}`) ?? null) : null,
      };
      return taskVisibleTo(viewerCategory(t.project.id), ctx.userId, lens);
    })
    .map((t) => ({
      key: t.taskKey ?? t.externalKey,
      title: t.title,
      project: t.project.code,
      type: t.type,
      status: t.status,
      priority: t.priority,
      severity: t.severity,
      phase: t.phase,
      assignee: t.assignee?.name ?? t.externalAssigneeName,
      milestone: t.milestone?.name ?? null,
      estimate: t.estimate,
      dueDate: t.dueDate,
      source: t.sourceSystem ?? "qubit",
      lastActivityAt: t.lastActivityAt,
    }));
}

async function workloadRows(ctx: TenantContext): Promise<ReportRow[]> {
  const rows = await listWorkload(ctx);
  // Row scoping, not a route gate: everyone may report on their OWN workload
  // (report:resource:self is BASE); the whole roster needs report:resource:others.
  const scoped = can(ctx, "report:resource:others") ? rows : rows.filter((r) => r.userId === ctx.userId);
  return scoped.map((r) => ({
    name: r.name,
    email: r.email,
    department: r.departmentName,
    projects: r.projectCount,
    allocatedPct: r.totalPct,
    effectivePct: r.effectivePct,
    onLeaveUntil: r.onLeaveUntil,
    allocations: r.allocations.map((a) => `${a.projectCode} ${a.role} ${a.allocationPct ?? "—"}%`).join("; ") || null,
  }));
}

const BUILDERS: Record<ReportDatasetKey, (ctx: TenantContext) => Promise<ReportRow[]>> = {
  projects: projectRows,
  portfolios: portfolioRows,
  programmes: programmeRows,
  risks: riskRows,
  issues: issueRows,
  tasks: taskRows,
  workload: workloadRows,
};

export interface CustomReportResult {
  dataset: ReportDatasetKey;
  columns: { key: string; label: string; type: string }[];
  rows: ReportRow[];
}

export async function runCustomReport(
  ctx: TenantContext,
  dataset: ReportDatasetKey,
  columnKeys: string[],
): Promise<CustomReportResult> {
  const meta = reportDataset(dataset);
  const byKey = new Map(meta.columns.map((c) => [c.key, c]));
  const unknown = columnKeys.filter((k) => !byKey.has(k));
  if (unknown.length) throw new CustomReportError(`Unknown column(s) for ${dataset}: ${unknown.join(", ")}.`);
  const keys = columnKeys.length ? [...new Set(columnKeys)] : meta.defaults;

  const full = await BUILDERS[dataset](ctx);
  return {
    dataset,
    columns: keys.map((k) => {
      const c = byKey.get(k)!;
      return { key: c.key, label: c.label, type: c.type };
    }),
    rows: full.map((row) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]))),
  };
}
