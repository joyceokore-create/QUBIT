import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { forTenant } from "@/server/tenant-db";
import { Forbidden } from "@/components/forbidden";
import { ProjectsClient } from "./projects-client";

// Riverbank's primary surface: a flat, filterable list of all projects (no subsidiary
// heatmap). Replaces the old /portfolios ComingSoon stub for MVP1. QUBIT App v3 language.
export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:read")) return <Forbidden />;

  const [projects, memberCounts, myMemberships, myLeads] = await Promise.all([
    listProjects(ctx),
    forTenant(ctx, (tx) => tx.projectMember.groupBy({ by: ["projectId"], _count: { _all: true } })),
    forTenant(ctx, (tx) => tx.projectMember.findMany({ where: { userId: ctx.userId }, select: { projectId: true } })),
    forTenant(ctx, (tx) => tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } })),
  ]);
  const countByProject = new Map(memberCounts.map((r) => [r.projectId, r._count._all]));
  // "Mine" = the viewer leads it or is allocated to it (per Joyce: filter mine everywhere).
  const mineIds = new Set([...myMemberships.map((m) => m.projectId), ...myLeads.map((p) => p.id)]);

  return (
    <ProjectsClient
      tenantName={session.user.tenantName}
      projects={projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type,
        priority: p.priority,
        status: p.status,
        dueDate: p.dueDate ? p.dueDate.toISOString() : null,
        budget: p.budget,
        avgProgress: p.avgProgress,
        memberCount: countByProject.get(p.id) ?? 0,
        isMine: mineIds.has(p.id),
      }))}
      canCreate={can(ctx, "project:create")}
    />
  );
}
