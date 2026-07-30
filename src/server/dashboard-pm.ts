import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { listWorkload } from "@/server/resources";

/**
 * PM preset data (docs/17 §3): "Are my projects on track this week, and what's stuck
 * on me?" Default scope is the projects the viewer leads or PM-manages — a FILTER with
 * an all-projects toggle, never a visibility wall (DM1.20). Same engines as every other
 * surface: RAG from health.ts, deltas from snapshots, check-ins from M2.
 */

const PM_PROJECT_ROLES = ["Project Manager"];
const day = 86_400_000;

export interface PmActionRow {
  kind: "join" | "drafts" | "blocker" | "slipping" | "report";
  title: string;
  project: string;
  meta: string;
  href: string;
}

// The project listing itself is the shared pipeline table (docs/18 §6) — fetched via
// getPipelineTable and rendered with scope="mine" by default.
export interface PmDashboard {
  hero: {
    /** My active projects' check-ins this week. */
    checkins: { confirmed: number; total: number };
    agedBlockers: number;
    draftsPending: number;
  };
  actionQueue: PmActionRow[];
  teamLoad: { userId: string; name: string; totalPct: number }[];
  myProjectCount: number;
}

export async function getPmDashboard(ctx: TenantContext, now = new Date()): Promise<PmDashboard> {
  const isoWeek = isoWeekId(now);
  const [workload, live] = await Promise.all([
    listWorkload(ctx),
    withTenant(ctx, async (tx) => {
      const [projects, checkIns, openBlockers, draftGroups, joinRequests, slipping, myMemberUserIds] =
        await Promise.all([
          tx.project.findMany({
            where: { status: { notIn: ["Completed", "Cancelled"] } },
            select: {
              id: true,
              name: true,
              leadUserId: true,
              members: { where: { role: { in: PM_PROJECT_ROLES } }, select: { userId: true } },
            },
            orderBy: { name: "asc" },
          }),
          tx.checkIn.findMany({ where: { isoWeek }, select: { projectId: true, status: true } }),
          tx.blocker.findMany({
            where: { status: "Open" },
            select: { id: true, description: true, createdAt: true, projectId: true, taskId: true, project: { select: { name: true } } },
          }),
          tx.projectTask.groupBy({ by: ["projectId"], where: { approvalStatus: "Draft" }, _count: { _all: true } }),
          tx.joinRequest.findMany({
            where: { status: "Pending" },
            select: { id: true, projectId: true, user: { select: { name: true } }, project: { select: { name: true } }, createdAt: true },
          }),
          tx.projectTask.findMany({
            where: {
              approvalStatus: { not: "Draft" },
              status: { not: "Completed" },
              dueDate: { lt: new Date(now.getTime() + 7 * day) },
            },
            select: { id: true, title: true, taskKey: true, dueDate: true, projectId: true, project: { select: { name: true } } },
            orderBy: { dueDate: "asc" },
          }),
          tx.projectMember.findMany({ select: { projectId: true, userId: true } }),
        ]);
      // docs/18 §5.1.4 — member reports submitted to me and not yet acknowledged.
      const submittedReports = await tx.memberReport.findMany({
        where: { isoWeek, status: { in: ["Submitted", "Acknowledged"] }, userId: { not: ctx.userId } },
        select: {
          id: true,
          submittedAt: true,
          draft: true,
          user: { select: { name: true } },
          acks: { select: { projectId: true } },
        },
      });
      return { projects, checkIns, openBlockers, draftGroups, joinRequests, slipping, myMemberUserIds, submittedReports };
    }),
  ]);

  const mine = new Set(
    live.projects
      .filter((p) => p.leadUserId === ctx.userId || p.members.some((m) => m.userId === ctx.userId))
      .map((p) => p.id),
  );

  const confirmedByProject = new Map(live.checkIns.map((c) => [c.projectId, c.status === "Confirmed"]));

  // ── Action queue (§3): everything stuck on ME, deep-linked to where it's fixed ──
  const ageDays = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / day));
  const agedBlockers = live.openBlockers.filter((b) => mine.has(b.projectId) && ageDays(b.createdAt) >= 3);
  const myDrafts = live.draftGroups.filter((g) => mine.has(g.projectId));
  const myJoins = live.joinRequests.filter((j) => mine.has(j.projectId));
  const mySlipping = live.slipping.filter((t) => mine.has(t.projectId));

  // Member reports waiting on MY acknowledgement, for MY projects only (§5.1.3).
  const pendingReports = live.submittedReports.flatMap((r) => {
    const draft = r.draft as { sections?: { projectId: string; projectName: string }[] };
    const acked = new Set(r.acks.map((a) => a.projectId));
    return (draft.sections ?? [])
      .filter((s) => mine.has(s.projectId) && !acked.has(s.projectId))
      .map((s) => ({ name: r.user.name, projectName: s.projectName, submittedAt: r.submittedAt }));
  });

  const actionQueue: PmActionRow[] = [
    ...pendingReports.slice(0, 5).map((r) => ({
      kind: "report" as const,
      title: `${r.name} sent their weekly report`,
      project: r.projectName,
      meta: r.submittedAt ? `${ageDays(r.submittedAt)}d waiting` : "acknowledge it",
      href: "/reports?tab=team",
    })),
    ...myJoins.map((j) => ({
      kind: "join" as const,
      title: `${j.user.name} asked to join`,
      project: j.project.name,
      meta: `${ageDays(j.createdAt)}d waiting`,
      href: "/my-tasks",
    })),
    ...myDrafts.map((g) => ({
      kind: "drafts" as const,
      title: `${g._count._all} AI draft${g._count._all === 1 ? "" : "s"} awaiting approval`,
      project: live.projects.find((p) => p.id === g.projectId)?.name ?? "",
      meta: "publish or discard",
      href: `/projects/${g.projectId}?tab=Board`,
    })),
    ...agedBlockers.slice(0, 5).map((b) => ({
      kind: "blocker" as const,
      title: b.description.slice(0, 80),
      project: b.project.name,
      meta: `open ${ageDays(b.createdAt)}d`,
      href: b.taskId ? `/projects/${b.projectId}?tab=Board&task=${b.taskId}` : `/projects/${b.projectId}?tab=Deadlines`,
    })),
    ...mySlipping.slice(0, 5).map((t) => ({
      kind: "slipping" as const,
      title: `${t.taskKey ?? t.title.slice(0, 60)} ${t.dueDate! < now ? "is overdue" : "slips this week"}`,
      project: t.project.name,
      meta: t.dueDate!.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      href: `/projects/${t.projectId}?tab=Board&task=${t.id}`,
    })),
  ].slice(0, 12);

  // ── Team load (§3): people on MY projects only (leave badges join with M6) ──
  const myTeamUserIds = new Set(live.myMemberUserIds.filter((m) => mine.has(m.projectId)).map((m) => m.userId));
  const teamLoad = workload
    .filter((w) => myTeamUserIds.has(w.userId))
    .sort((a, b) => b.totalPct - a.totalPct)
    .slice(0, 10)
    .map((w) => ({ userId: w.userId, name: w.name, totalPct: w.totalPct }));

  const myActive = live.projects.filter((p) => mine.has(p.id));
  return {
    hero: {
      checkins: {
        confirmed: myActive.filter((p) => confirmedByProject.get(p.id) ?? false).length,
        total: myActive.length,
      },
      agedBlockers: agedBlockers.length,
      draftsPending: myDrafts.reduce((n, g) => n + g._count._all, 0),
    },
    actionQueue,
    teamLoad,
    myProjectCount: myActive.length,
  };
}
