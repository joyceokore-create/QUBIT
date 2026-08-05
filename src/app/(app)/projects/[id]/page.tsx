import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { canViewProject } from "@/lib/project-access";
import { canContributeToProject, canWriteProject } from "@/lib/access";
import { viewerBoardCategory } from "@/server/board-scope";
import { withTenant } from "@/lib/tenant";
import { listProjectIdeaProvenance } from "@/server/ideas";
import { getProjectPanelData } from "@/server/projects";
import { listProjectMembers } from "@/server/resources";
import { Forbidden } from "@/components/forbidden";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import type { ProjectPanelJson } from "@/components/panels/project-panel-content";

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Deep links (work-cycle UX): ?tab=Board&task=<id> jumps to a highlighted card;
  // ?lens=qa|dev|all picks the board lens. My Tasks rows and notifications use these.
  searchParams: Promise<{ tab?: string; task?: string; lens?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const { id } = await params;
  const sp = await searchParams;

  if (!(await canViewProject(ctx, id))) return <Forbidden />;

  const [p, members, canContribute, canPublish, membership, portfolios, viewerCategory] = await Promise.all([
    getProjectPanelData(ctx, id),
    listProjectMembers(ctx, id),
    canContributeToProject(ctx, id),
    canWriteProject(ctx, id), // plan publishing + join-request decisions (PM-level)
    withTenant(ctx, async (tx) => {
      const [lead, m] = await Promise.all([
        tx.project.findFirst({ where: { id, leadUserId: ctx.userId }, select: { id: true } }),
        tx.projectMember.findFirst({ where: { projectId: id, userId: ctx.userId }, select: { id: true, role: true } }),
      ]);
      return { isMember: Boolean(lead || m), isLead: Boolean(lead) };
    }),
    // Portfolio choices for the governance editor's move control (docs/18 §0.5).
    withTenant(ctx, (tx) => tx.portfolio.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })),
    // DM1.43: ONE computation shared with the tasks API, so the toggles the page renders
    // and the rows the server returns can never disagree.
    viewerBoardCategory(ctx, id),
  ]);
  // M-P2c — dependency picker candidates (active projects only).
  const allProjects = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { status: { notIn: ["Completed", "Cancelled"] } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  );
  // M-P4a — where this project came from: the idea(s) accepted into or merged into it.
  const ideaProvenance = await listProjectIdeaProvenance(ctx, id);
  // M-P2b — the Delivery tab's market tracks (docs/25 §3 tab 4).
  const marketTracks = await withTenant(ctx, (tx) =>
    tx.projectOrgStatus.findMany({
      where: { projectId: id, orgUnit: { kind: "Market" } },
      select: { orgUnitId: true, progress: true, status: true, orgUnit: { select: { code: true, flag: true } } },
      orderBy: { orgUnit: { code: "asc" } },
    }),
  );
  if (!p) notFound();

  const data: ProjectPanelJson = {
    ...p,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    canEdit: can(ctx, "project:update"), // project settings / team
    canContribute, // tasks + blockers: any project member
    canPublish, // plan approval (Draft → Published) — PM-level (DM1.15 №3)
    canGovern: can(ctx, "project:stage") || (await canWriteProject(ctx, id)), // docs/18 §7
    portfolios,
    viewerCategory,
    allProjects,
    ideaProvenance,
    marketTracks: marketTracks.map((m) => ({
      orgUnitId: m.orgUnitId,
      code: m.orgUnit.code,
      flag: m.orgUnit.flag,
      progress: m.progress,
      status: m.status,
    })),
    isMember: membership.isMember, // viewer leads or is allocated → hides "Request to join"
  };

  return (
    <ProjectWorkspace
      data={data}
      members={members.map((m) => ({ name: m.name }))}
      viewerId={ctx.userId}
      initialTab={sp.tab}
      focusTaskId={sp.task ?? null}
      initialLens={sp.lens === "qa" || sp.lens === "dev" || sp.lens === "impl" || sp.lens === "all" ? sp.lens : null}
    />
  );
}
