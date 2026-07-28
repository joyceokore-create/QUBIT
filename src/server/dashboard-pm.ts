import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { avgProgress } from "@/server/dashboard";
import { projectRag, ragRank, type Rag } from "@/server/health";
import { listWorkload } from "@/server/resources";

/**
 * PM preset data (docs/17 §3): "Are my projects on track this week, and what's stuck
 * on me?" Default scope is the projects the viewer leads or PM-manages — a FILTER with
 * an all-projects toggle, never a visibility wall (DM1.20). Same engines as every other
 * surface: RAG from health.ts, deltas from snapshots, check-ins from M2.
 */

const PM_PROJECT_ROLES = ["Project Manager"];
const day = 86_400_000;

export interface PmProjectCard {
  id: string;
  code: string;
  name: string;
  rag: Rag;
  /** RAG movement vs ~7 days ago: -1 improved · 0 flat · 1 worsened; null without history. */
  ragDelta: -1 | 0 | 1 | null;
  progress: number;
  /** Progress vs the portfolio average — the comparison ask (§3). */
  vsAvg: number;
  nextMilestone: { name: string; due: Date } | null;
  openBlockers: number;
  /** This week's check-in not yet confirmed. */
  unconfirmed: boolean;
  isMine: boolean;
}

export interface PmActionRow {
  kind: "join" | "drafts" | "blocker" | "slipping";
  title: string;
  project: string;
  meta: string;
  href: string;
}

export interface PmDashboard {
  hero: {
    /** My active projects' check-ins this week. */
    checkins: { confirmed: number; total: number };
    agedBlockers: number;
    draftsPending: number;
  };
  cards: PmProjectCard[];
  actionQueue: PmActionRow[];
  teamLoad: { userId: string; name: string; totalPct: number }[];
  portfolioAvgProgress: number;
  myProjectCount: number;
}

export async function getPmDashboard(ctx: TenantContext, now = new Date()): Promise<PmDashboard> {
  const isoWeek = isoWeekId(now);
  const [workload, live] = await Promise.all([
    listWorkload(ctx),
    withTenant(ctx, async (tx) => {
      const [projects, checkIns, weekAgoSnaps, openBlockers, draftGroups, joinRequests, slipping, milestones, myMemberUserIds] =
        await Promise.all([
          tx.project.findMany({
            where: { status: { notIn: ["Completed", "Cancelled"] } },
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              leadUserId: true,
              orgStatuses: { select: { progress: true } },
              members: { where: { role: { in: PM_PROJECT_ROLES } }, select: { userId: true } },
            },
            orderBy: { name: "asc" },
          }),
          tx.checkIn.findMany({ where: { isoWeek }, select: { projectId: true, status: true } }),
          tx.projectSnapshot.findMany({
            where: { day: { lte: new Date(now.getTime() - 6 * day), gte: new Date(now.getTime() - 10 * day) } },
            orderBy: { day: "desc" },
            select: { projectId: true, status: true },
          }),
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
          tx.projectMilestone.findMany({
            where: { status: { not: "Done" }, dueDate: { gte: now } },
            orderBy: { dueDate: "asc" },
            select: { projectId: true, name: true, dueDate: true },
          }),
          tx.projectMember.findMany({ select: { projectId: true, userId: true } }),
        ]);
      return { projects, checkIns, weekAgoSnaps, openBlockers, draftGroups, joinRequests, slipping, milestones, myMemberUserIds };
    }),
  ]);

  const mine = new Set(
    live.projects
      .filter((p) => p.leadUserId === ctx.userId || p.members.some((m) => m.userId === ctx.userId))
      .map((p) => p.id),
  );

  const confirmedByProject = new Map(live.checkIns.map((c) => [c.projectId, c.status === "Confirmed"]));
  const lastWeekStatus = new Map<string, string>();
  for (const s of live.weekAgoSnaps) if (!lastWeekStatus.has(s.projectId)) lastWeekStatus.set(s.projectId, s.status);
  const blockersByProject = new Map<string, number>();
  for (const b of live.openBlockers) blockersByProject.set(b.projectId, (blockersByProject.get(b.projectId) ?? 0) + 1);
  const nextMilestone = new Map<string, { name: string; due: Date }>();
  for (const m of live.milestones) {
    if (m.dueDate && !nextMilestone.has(m.projectId)) nextMilestone.set(m.projectId, { name: m.name, due: m.dueDate });
  }

  const progresses = live.projects.map((p) => avgProgress(p));
  const portfolioAvgProgress = progresses.length
    ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
    : 0;

  const cards: PmProjectCard[] = live.projects.map((p, i) => {
    const prev = lastWeekStatus.get(p.id) ?? null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      rag: projectRag(p.status),
      ragDelta: prev === null ? null : (Math.sign(ragRank(p.status) - ragRank(prev)) as -1 | 0 | 1),
      progress: progresses[i],
      vsAvg: progresses[i] - portfolioAvgProgress,
      nextMilestone: nextMilestone.get(p.id) ?? null,
      openBlockers: blockersByProject.get(p.id) ?? 0,
      unconfirmed: !(confirmedByProject.get(p.id) ?? false),
      isMine: mine.has(p.id),
    };
  });

  // ── Action queue (§3): everything stuck on ME, deep-linked to where it's fixed ──
  const ageDays = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / day));
  const agedBlockers = live.openBlockers.filter((b) => mine.has(b.projectId) && ageDays(b.createdAt) >= 3);
  const myDrafts = live.draftGroups.filter((g) => mine.has(g.projectId));
  const myJoins = live.joinRequests.filter((j) => mine.has(j.projectId));
  const mySlipping = live.slipping.filter((t) => mine.has(t.projectId));

  const actionQueue: PmActionRow[] = [
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

  const myActive = cards.filter((c) => c.isMine);
  return {
    hero: {
      checkins: { confirmed: myActive.filter((c) => !c.unconfirmed).length, total: myActive.length },
      agedBlockers: agedBlockers.length,
      draftsPending: myDrafts.reduce((n, g) => n + g._count._all, 0),
    },
    cards,
    actionQueue,
    teamLoad,
    portfolioAvgProgress,
    myProjectCount: myActive.length,
  };
}
