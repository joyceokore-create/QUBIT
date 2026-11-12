import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { checkinSummaryByProject } from "@/server/checkins";
import { forTenant } from "@/server/tenant-db";
import { Forbidden } from "@/components/forbidden";
import { ProjectsClient } from "./projects-client";
import { getCockpitData, stageOf } from "@/server/dashboard-cockpit";
import { gateTrackRow, healthOf, type GateViewRow } from "@/lib/project-gate-view";

// Riverbank's primary surface: a flat, filterable list of all projects (no subsidiary
// heatmap). Replaces the old /portfolios ComingSoon stub for MVP1. QUBIT App v3 language.
//
// UX8 — two views: List (default) and Gate view (`?view=gates`), the stage-gate tracker on
// the same cockpit load (no second estate query).
type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const view = sp.view === "gates" ? "gates" : "list";
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

  // UX8: the Gate view's rows — only shaped (and sent) when that view is open.
  const gateRows: GateViewRow[] =
    view === "gates"
      ? projects.map((p) => {
          const c = cockpit.get(p.id);
          return {
            id: p.id,
            code: p.code,
            name: p.name,
            priority: p.priority,
            pm: c?.pmName ?? null,
            health: healthOf(checkins.get(p.id) ?? null),
            track: c
              ? gateTrackRow({
                  gates: c.gates,
                  currentGate: c.currentGate,
                  buildTrack: c.buildTrack,
                  pct: c.pct,
                  markets: c.markets.map((m) => ({ code: m.code, name: m.market, pct: m.pct, gates: m.gates })),
                })
              : gateTrackRow({ gates: { brd: "none", proto: "none", mvp1: "none", sit: "none", uat: "none", golive: "none" }, currentGate: null, buildTrack: false, pct: p.avgProgress, markets: [] }),
          };
        })
      : [];

  return (
    <ProjectsClient
      view={view}
      gateRows={gateRows}
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
