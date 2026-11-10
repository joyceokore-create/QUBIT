import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can, primaryRoleLabel } from "@/lib/rbac";
import { ssoEnabled } from "@/lib/sso";
import { taskVisibleTo, type LensTask } from "@/lib/board-lens";
import { projectRoleCategory, type ProjectRoleCategory } from "@/lib/roles";
import {
  MY_DATASET_KEYS,
  myProjectRole,
  reportDataset,
  type ReportDatasetKey,
} from "@/lib/report-catalogue";
import { customReportsOnly } from "@/lib/reports-view";
import { ownerNamesById } from "@/server/raid-shared";
import { listRisks } from "@/server/risks";
import { listIssues } from "@/server/issues";
import { listWorkload } from "@/server/resources";
import { listUsersForReport } from "@/server/users";
import { listAccessRequests } from "@/server/access-requests";

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
  // UX6 — any signed-in user; each builder filters to ctx.userId's OWN rows, so these can
  // never widen what anyone sees (the tenant-wide sets above keep their own gates).
  myTasks: null,
  myProjects: null,
  myBlockers: null,
  // UX11 — admin datasets: the Users page's gate, and the Access requests page's gate.
  users: "admin:access",
  accessRequests: "iam:manage",
};

/** Datasets this viewer may run (the route-level gate; the API door honours exactly this). */
export function allowedDatasetKeys(ctx: TenantContext): ReportDatasetKey[] {
  return (Object.keys(DATASET_PERMISSION) as ReportDatasetKey[]).filter((k) => {
    const perm = DATASET_PERMISSION[k];
    return perm === null || can(ctx, perm);
  });
}

/**
 * Datasets the builder OFFERS (UX plan D13). A viewer without reports:read (a Member) is
 * offered only the "My …" datasets, even though BASE read permissions would let them run
 * the tenant-wide ones through the API (unchanged behaviour). Report readers get every
 * dataset they may run, the "My …" ones included.
 */
export function offeredDatasetKeys(ctx: TenantContext): ReportDatasetKey[] {
  const allowed = allowedDatasetKeys(ctx);
  if (!customReportsOnly(ctx)) return allowed;
  return allowed.filter((k) => (MY_DATASET_KEYS as readonly string[]).includes(k));
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

// ── UX6: the "My …" datasets ─────────────────────────────────────────────────────────
// Every query below is filtered to ctx.userId inside withTenant, so a row is returned only
// when it is BOTH in the caller's tenant (RLS) AND the caller's own (the where clause).

/** Tasks assigned to me — Published only (Drafts never reach reports), done ones included. */
async function myTaskRows(ctx: TenantContext): Promise<ReportRow[]> {
  const tasks = await withTenant(ctx, (tx) =>
    tx.projectTask.findMany({
      where: { assigneeId: ctx.userId, approvalStatus: "Published" },
      select: {
        taskKey: true,
        externalKey: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        phase: true,
        estimate: true,
        dueDate: true,
        lastActivityAt: true,
        milestone: { select: { name: true } },
        project: { select: { code: true } },
        // "Blocked" is a flag: an Open blocker pointing at the task (or the legacy status).
        blockers: { where: { status: "Open" }, select: { id: true }, take: 1 },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { lastActivityAt: "desc" }],
    }),
  );
  return tasks.map((t) => ({
    title: t.title,
    key: t.taskKey ?? t.externalKey,
    project: t.project.code,
    status: t.status,
    dueDate: t.dueDate,
    estimate: t.estimate,
    priority: t.priority,
    type: t.type,
    blocked: t.status === "Blocked" || t.blockers.length > 0,
    phase: t.phase,
    milestone: t.milestone?.name ?? null,
    lastActivityAt: t.lastActivityAt,
  }));
}

/** Projects I am a member of or lead, with my role(s) and my open (not Completed) tasks. */
async function myProjectRows(ctx: TenantContext): Promise<ReportRow[]> {
  const projects = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { OR: [{ leadUserId: ctx.userId }, { members: { some: { userId: ctx.userId } } }] },
      select: {
        code: true,
        name: true,
        status: true,
        priority: true,
        dueDate: true,
        leadUserId: true,
        lead: { select: { name: true } },
        portfolio: { select: { name: true } },
        members: { where: { userId: ctx.userId }, select: { role: true } },
        _count: {
          select: {
            projectTasks: { where: { assigneeId: ctx.userId, approvalStatus: "Published", status: { not: "Completed" } } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  );
  return projects.map((p) => ({
    code: p.code,
    name: p.name,
    role: myProjectRole(p.leadUserId === ctx.userId, p.members.map((m) => m.role)),
    status: p.status,
    dueDate: p.dueDate,
    openTasks: p._count.projectTasks,
    lead: p.lead?.name ?? null,
    portfolio: p.portfolio?.name ?? null,
    priority: p.priority,
  }));
}

/**
 * Blockers I raised. The rule:
 *   - raisedById = me (every blocker raised since UX6 records its raiser); or
 *   - for rows raised BEFORE UX6 (raisedById IS NULL — the raiser was never stored), the
 *     best honest proxy: ownerId = me AND the blocked task is assigned to me (the old
 *     "flag my own task as blocked" flow made the assignee the owner).
 * A legacy row owned by me on someone else's task, or with no task, is NOT counted — it
 * was most likely raised AT me, not BY me. Machine-raised blockers stay NULL and only
 * match through that same fallback.
 */
export function myBlockersWhere(userId: string): Prisma.BlockerWhereInput {
  return {
    OR: [{ raisedById: userId }, { raisedById: null, ownerId: userId, task: { is: { assigneeId: userId } } }],
  };
}

async function myBlockerRows(ctx: TenantContext): Promise<ReportRow[]> {
  const blockers = await withTenant(ctx, (tx) =>
    tx.blocker.findMany({
      where: myBlockersWhere(ctx.userId),
      select: {
        description: true,
        severity: true,
        status: true,
        dateRaised: true,
        resolutionNotes: true,
        project: { select: { code: true } },
        task: { select: { taskKey: true, externalKey: true, title: true } },
        owner: { select: { name: true } },
      },
      orderBy: { dateRaised: "desc" },
    }),
  );
  return blockers.map((b) => {
    const taskKey = b.task ? (b.task.taskKey ?? b.task.externalKey) : null;
    return {
      description: b.description,
      project: b.project.code,
      task: b.task ? (taskKey ? `${taskKey} ${b.task.title}` : b.task.title) : null,
      severity: b.severity,
      status: b.status,
      dateRaised: b.dateRaised,
      owner: b.owner?.name ?? null,
      resolutionNotes: b.resolutionNotes,
    };
  });
}

// ── UX11: the admin datasets ─────────────────────────────────────────────────────────

const USER_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended" };

/**
 * The user directory (status ≠ DELETED) under the tenant's RLS context, through the same
 * read the Users page uses (roles, department, counts) plus team names. MFA is a STATUS —
 * On / Off, or "SSO" when the identity provider enforces it — never the secret.
 */
async function userRows(ctx: TenantContext): Promise<ReportRow[]> {
  const sso = ssoEnabled();
  const users = await listUsersForReport(ctx);
  return users.map((u) => ({
    name: u.name,
    email: u.email,
    roles: u.roles.map((r) => primaryRoleLabel([r])).join(", ") || null,
    department: u.departmentName,
    status: USER_STATUS_LABEL[u.status] ?? u.status,
    mfa: sso ? "SSO" : u.mfaEnabled ? "On" : "Off",
    lastActive: u.lastLoginAt,
    createdAt: u.createdAt,
    teams: u.teamNames.join(", ") || null,
  }));
}

const ACCESS_REQUEST_STATUS_LABEL: Record<string, string> = { NEW: "New", REVIEWED: "Reviewed", DISMISSED: "Dismissed" };

/**
 * The request-access queue. access_request is a SYSTEM table with no tenant_id (requests
 * arrive before any tenant exists), so it is read through access-requests.ts's system read,
 * exactly as the Access requests page does — the gate is iam:manage (DATASET_PERMISSION,
 * re-checked in runCustomReport), not tenant scoping.
 */
async function accessRequestRows(): Promise<ReportRow[]> {
  const requests = await listAccessRequests();
  return requests.map((r) => ({
    name: r.fullName,
    email: r.email,
    company: r.company,
    jobTitle: r.jobTitle,
    status: ACCESS_REQUEST_STATUS_LABEL[r.status] ?? r.status,
    submittedAt: r.createdAt,
    reviewedAt: r.reviewedAt,
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
  myTasks: myTaskRows,
  myProjects: myProjectRows,
  myBlockers: myBlockerRows,
  users: userRows,
  accessRequests: accessRequestRows,
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
  // Defence in depth: every door (the JSON/CSV route, the PDF export, the email action)
  // already checks DATASET_PERMISSION, but the engine refuses on its own too, so no future
  // caller can run e.g. the admin datasets for a viewer without the gate.
  if (!allowedDatasetKeys(ctx).includes(dataset)) {
    throw new CustomReportError("That dataset is not yours to report on.", "FORBIDDEN");
  }
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
