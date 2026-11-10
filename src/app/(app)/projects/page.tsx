import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { checkinSummaryByProject } from "@/server/checkins";
import { forTenant } from "@/server/tenant-db";
import { Forbidden } from "@/components/forbidden";
import { ProjectsClient } from "./projects-client";
import { getCockpitData, stageOf } from "@/server/dashboard-cockpit";

// Riverbank's primary surface: a flat, filterable list of all projects (no subsidiary
// heatmap). Replaces the old /portfolios ComingSoon stub for MVP1. QUBIT App v3 language.
export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:read")) return <Forbidden />;

  const [projects, memberCounts, myMemberships, myLeads, checkins, cockpitData] = await Promise.all([
    listProjects(ctx),
    forTenant(ctx, (tx) => tx.projectMember.groupBy({ by: ["projectId"], _count: { _all: true } })),
    forTenant(ctx, (tx) => tx.projectMember.findMany({ where: { userId: ctx.userId }, select: { projectId: true } })),
    forTenant(ctx, (tx) => tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } })),
    // DM1.73 (Wave C, C4): this week's check-in per project — freshness on the list.
    checkinSummaryByProject(ctx),
    getCockpitData(ctx),
  ]);
  // UX5: portfolio, PM and stage come from the cockpit assembler — the same values the
  // dashboard shows, so the two can never disagree (stage = the project's real gates).
  const cockpit = new Map(cockpitData.projects.map((p) => [p.id, p]));
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
        portfolio: cockpit.get(p.id)?.portfolioName ?? null,
        pm: cockpit.get(p.id)?.pmName ?? null,
        stage: (() => {
          const c = cockpit.get(p.id);
          return c ? stageOf(c).phase : "Not gated";
        })(),
        // DM1.73 (Wave C, C4): this week's check-in RAG + confirmation, or null.
        checkin: (() => {
          const c = checkins.get(p.id);
          return c ? { rag: c.rag, confirmed: c.confirmed } : null;
        })(),
      }))}
      canCreate={can(ctx, "project:create")}
    />
  );
}
