// M-P2c (docs/33, docs/26 §6) — cross-project dependencies: "Project A's UAT waits on
// B's API." A link + the portfolio-level "what's blocking what" view, cycle-checked at
// write time with the same walk M7-A uses for tasks. Adding/removing is delivery-owner
// territory (canWriteProject: the project's lead/PM, or a Head).
import { audit } from "@/lib/audit";
import { canWriteProject } from "@/lib/access";
import { projectRag, type Rag } from "@/server/health";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";

export class ProjectDependencyError extends Error {
  code: string;
  constructor(message: string, code = "DEPENDENCY_ERROR") {
    super(message);
    this.code = code;
  }
}

export interface ProjectEdge {
  projectId: string;
  dependsOnProjectId: string;
}

/** Would adding `projectId → dependsOnProjectId` close a loop? Pure (M7-A pattern). */
export function wouldCycleProjects(edges: ProjectEdge[], projectId: string, dependsOnProjectId: string): boolean {
  if (projectId === dependsOnProjectId) return true; // a project cannot wait on itself
  const waitsOn = new Map<string, string[]>();
  for (const e of edges) {
    const list = waitsOn.get(e.projectId) ?? [];
    list.push(e.dependsOnProjectId);
    waitsOn.set(e.projectId, list);
  }
  const seen = new Set<string>();
  const stack = [dependsOnProjectId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === projectId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(waitsOn.get(current) ?? []));
  }
  return false;
}

export async function addProjectDependency(
  ctx: TenantContext,
  projectId: string,
  dependsOnProjectId: string,
  note?: string,
) {
  if (!(await canWriteProject(ctx, projectId))) {
    throw new ProjectDependencyError("Only the project's PM or a Head can declare dependencies.", "FORBIDDEN");
  }
  return withTenant(ctx, async (tx) => {
    const [project, dependsOn, edges, existing] = await Promise.all([
      tx.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } }),
      tx.project.findUnique({
        where: { id: dependsOnProjectId },
        select: { id: true, code: true, name: true, leadUserId: true },
      }),
      tx.projectDependency.findMany({ select: { projectId: true, dependsOnProjectId: true } }),
      tx.projectDependency.findUnique({
        where: { projectId_dependsOnProjectId: { projectId, dependsOnProjectId } },
        select: { id: true },
      }),
    ]);
    if (!project || !dependsOn) throw new ProjectDependencyError("Project not found.", "NOT_FOUND");
    if (existing) throw new ProjectDependencyError("That dependency already exists.", "ALREADY_EXISTS");
    if (wouldCycleProjects(edges, projectId, dependsOnProjectId)) {
      throw new ProjectDependencyError(
        `That would make ${project.code} and ${dependsOn.code} wait on each other.`,
        "DEPENDENCY_CYCLE",
      );
    }

    const dep = await tx.projectDependency.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        dependsOnProjectId,
        note: note?.trim() || null,
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "project_dependency",
      entityId: dep.id,
      after: { projectId, dependsOnProjectId, note: dep.note },
    });
    await emitDomainEvent(tx, ctx, {
      type: "project_dependency.created",
      entityType: "project_dependency",
      entityId: dep.id,
      payload: { project: project.code, waitsOn: dependsOn.code },
      // The OTHER side's PM should know their delivery now gates someone else's.
      notify:
        dependsOn.leadUserId && dependsOn.leadUserId !== ctx.userId
          ? [{
              userId: dependsOn.leadUserId,
              kind: "project_dependency.created",
              message: `${project.code} (${project.name}) now waits on ${dependsOn.code} — your delivery gates theirs.`,
              link: `/projects/${dependsOnProjectId}`,
            }]
          : [],
    });
    return dep;
  });
}

export async function removeProjectDependency(ctx: TenantContext, projectId: string, dependsOnProjectId: string) {
  if (!(await canWriteProject(ctx, projectId))) {
    throw new ProjectDependencyError("Only the project's PM or a Head can remove dependencies.", "FORBIDDEN");
  }
  return withTenant(ctx, async (tx) => {
    const { count } = await tx.projectDependency.deleteMany({ where: { projectId, dependsOnProjectId } });
    if (count === 0) throw new ProjectDependencyError("Dependency not found.", "NOT_FOUND");
    await audit(tx, ctx, {
      action: "delete",
      entityType: "project_dependency",
      entityId: `${projectId}:${dependsOnProjectId}`,
      before: { projectId, dependsOnProjectId },
      after: null,
    });
    return { ok: true };
  });
}

export interface DependencyRef {
  projectId: string;
  code: string;
  name: string;
  status: string;
  rag: Rag;
  note: string | null;
}

/** Both directions for the workspace card: what this project waits on, and what it blocks. */
export async function listProjectDependencies(
  ctx: TenantContext,
  projectId: string,
): Promise<{ waitsOn: DependencyRef[]; blocks: DependencyRef[] }> {
  return withTenant(ctx, async (tx) => {
    const [waits, blocks] = await Promise.all([
      tx.projectDependency.findMany({
        where: { projectId },
        select: { note: true, dependsOnProject: { select: { id: true, code: true, name: true, status: true } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.projectDependency.findMany({
        where: { dependsOnProjectId: projectId },
        select: { note: true, project: { select: { id: true, code: true, name: true, status: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const ref = (p: { id: string; code: string; name: string; status: string }, note: string | null): DependencyRef => ({
      projectId: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      rag: projectRag(p.status),
      note,
    });
    return {
      waitsOn: waits.map((w) => ref(w.dependsOnProject, w.note)),
      blocks: blocks.map((b) => ref(b.project, b.note)),
    };
  });
}

export interface BlockingEdge {
  projectId: string;
  projectCode: string;
  projectName: string;
  waitsOnId: string;
  waitsOnCode: string;
  waitsOnName: string;
  waitsOnStatus: string;
  waitsOnRag: Rag;
  note: string | null;
}

/** docs/33 M-P2c — the portfolio "what's blocking what": live edges (the depended-on
 * project not delivered), grouped by the WAITING project's portfolio, reddest first. */
export async function blockingMap(
  ctx: TenantContext,
): Promise<{ portfolioId: string | null; portfolioName: string; edges: BlockingEdge[] }[]> {
  return withTenant(ctx, async (tx) => {
    const deps = await tx.projectDependency.findMany({
      where: { dependsOnProject: { status: { notIn: ["Completed", "Cancelled"] } } },
      select: {
        note: true,
        project: {
          select: { id: true, code: true, name: true, portfolioId: true, portfolio: { select: { name: true } } },
        },
        dependsOnProject: { select: { id: true, code: true, name: true, status: true } },
      },
    });
    const groups = new Map<string, { portfolioId: string | null; portfolioName: string; edges: BlockingEdge[] }>();
    for (const d of deps) {
      const key = d.project.portfolioId ?? "none";
      const group = groups.get(key) ?? {
        portfolioId: d.project.portfolioId,
        portfolioName: d.project.portfolio?.name ?? "Unassigned",
        edges: [],
      };
      group.edges.push({
        projectId: d.project.id,
        projectCode: d.project.code,
        projectName: d.project.name,
        waitsOnId: d.dependsOnProject.id,
        waitsOnCode: d.dependsOnProject.code,
        waitsOnName: d.dependsOnProject.name,
        waitsOnStatus: d.dependsOnProject.status,
        waitsOnRag: projectRag(d.dependsOnProject.status),
        note: d.note,
      });
      groups.set(key, group);
    }
    const ragRank = (r: Rag) => (r === "Red" ? 0 : r === "Amber" ? 1 : 2);
    for (const g of groups.values()) {
      g.edges.sort((a, b) => ragRank(a.waitsOnRag) - ragRank(b.waitsOnRag) || a.projectCode.localeCompare(b.projectCode));
    }
    return [...groups.values()].sort(
      (a, b) => ragRank(a.edges[0].waitsOnRag) - ragRank(b.edges[0].waitsOnRag) || a.portfolioName.localeCompare(b.portfolioName),
    );
  });
}
