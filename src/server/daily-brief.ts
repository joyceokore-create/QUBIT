import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { isoWeekId } from "@/lib/iso-week";
import { countNewAccessRequests } from "@/server/access-requests";
import { prisma } from "@/lib/db";
import { listWorkload } from "@/server/resources";
import { getTenantTimeZone } from "@/server/preferences";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import { buildBrief, type Brief, type BriefExtras, type BriefTask } from "@/lib/daily-brief";
import { SUPER_ADMIN, type ViewRole } from "@/lib/view-roles";
import { approverScope } from "@/lib/gate-approval";
import { listGateQueue } from "@/server/gate-approval";
import { waitingDecisionsSummary } from "@/server/decision-requests";

/**
 * UX4 — the Daily Brief's reads (UX plan D4/D4a). The cockpit payload the page already loaded
 * is reused for everything project-shaped (performance note in the plan: no second estate
 * load); this module only adds the few role-specific reads the cockpit doesn't carry. Every
 * read runs under the tenant's RLS context, and each is gated by the permission that would let
 * the person act on it, so the Brief never mentions something its reader can't open.
 */

type Ctx = TenantContext;

const ACTIVE_PROJECT = { status: { notIn: ["Completed", "Cancelled"] } };

/** Pure-ish: which reads a role needs (exported for tests). */
export function briefReadsFor(role: ViewRole, ctx: TenantContext) {
  return {
    accessRequests: role === SUPER_ADMIN && can(ctx, "iam:manage"),
    accounts: role === SUPER_ADMIN && can(ctx, "admin:access"),
    ideas: role === "HeadOfProjects" && can(ctx, "idea:triage"),
    staffing: role === "HeadOfProjects" && can(ctx, "staffing:manage"),
    workload: role === "HeadOfProjects" && can(ctx, "project:read"),
    checkIns: role === "ProjectManager",
    critical: role === "HeadOfQA",
    myTasks: role === "Member",
    // WS1 — gate sign-off lines: approvers (on their own home), and the PM's returned gates.
    gatesWaiting: (role === "HeadOfProjects" || role === "HeadOfQA") && approverScope(ctx.roles) !== "none",
    gatesReturned: role === "ProjectManager",
    // WS2 — the Executive's real waiting decisions (replaces the signal-based suggestion).
    decisionsWaiting: role === "Executive",
  };
}

export async function getBriefExtras(ctx: Ctx, role: ViewRole, projects: CockpitProject[], now: Date): Promise<BriefExtras> {
  const reads = briefReadsFor(role, ctx);
  const extras: BriefExtras = {};

  const jobs: Promise<void>[] = [];

  if (reads.accessRequests) {
    // access_request is a system table (requests arrive before any tenant exists) — the same
    // read the admin nav badge already makes, behind iam:manage.
    jobs.push(
      Promise.all([
        countNewAccessRequests(),
        prisma.accessRequest.findFirst({ where: { status: "NEW" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]).then(([count, oldest]) => void (extras.accessRequests = { count, oldestAt: oldest?.createdAt ?? null })),
    );
  }

  if (reads.accounts) {
    jobs.push(
      withTenant(ctx, (tx) =>
        Promise.all([
          tx.user.count({ where: { status: "ACTIVE", mfaSecret: null } }),
          // An invite that ran out before it was used, for someone who never signed in.
          // People (not tokens) whose invite ran out: never signed in, not deleted, an expired
          // unused invite and no live one — the Admin home's "Invites expired" rule.
          tx.user.count({
            where: {
              lastLoginAt: null,
              status: { not: "DELETED" },
              AND: [
                { inviteTokens: { some: { purpose: "invite", consumedAt: null, expiresAt: { lt: now } } } },
                { inviteTokens: { none: { purpose: "invite", consumedAt: null, expiresAt: { gte: now } } } },
              ],
            },
          }),
        ]),
      ).then(([noMfa, expired]) => {
        extras.usersWithoutMfa = noMfa;
        extras.expiredInvites = expired;
      }),
    );
  }

  if (reads.ideas || reads.staffing) {
    jobs.push(
      withTenant(ctx, (tx) =>
        Promise.all([
          reads.ideas ? tx.idea.aggregate({ where: { status: { in: ["New", "Reviewing"] } }, _count: { _all: true }, _min: { createdAt: true } }) : null,
          reads.staffing ? tx.resourceRequest.aggregate({ where: { status: "Open" }, _count: { _all: true }, _min: { createdAt: true } }) : null,
        ]),
      ).then(([ideas, staffing]) => {
        if (ideas) extras.ideasNew = { count: ideas._count._all, oldestAt: ideas._min.createdAt };
        if (staffing) extras.staffingOpen = { count: staffing._count._all, oldestAt: staffing._min.createdAt };
      }),
    );
  }

  if (reads.workload) {
    jobs.push(
      listWorkload(ctx, now)
        .then((rows) => void (extras.overbooked = rows.filter((r) => r.totalPct > 100).map((r) => ({ name: r.name, pct: r.totalPct }))))
        .catch(() => undefined),
    );
  }

  if (reads.checkIns) {
    const mine = projects.filter((p) => p.pmIds.includes(ctx.userId)).map((p) => p.id);
    jobs.push(
      (mine.length
        ? withTenant(ctx, (tx) =>
            tx.checkIn.findMany({
              where: { projectId: { in: mine }, isoWeek: isoWeekId(now), submittedToHeadAt: { not: null } },
              select: { projectId: true },
            }),
          )
        : Promise.resolve([])
      ).then((rows) => void (extras.checkInsSent = rows.map((r) => r.projectId))),
    );
  }

  if (reads.critical) {
    jobs.push(
      withTenant(ctx, (tx) =>
        Promise.all([
          // The QA dashboard's rule: a Critical bug is open until Completed (dashboard-qa.ts).
          tx.projectTask.groupBy({
            by: ["projectId"],
            where: { type: "Bug", severity: "Critical", status: { not: "Completed" }, approvalStatus: "Published", project: ACTIVE_PROJECT },
            _count: { _all: true },
          }),
          tx.issue.groupBy({
            by: ["projectId"],
            where: { severity: "Critical", status: "Open", project: ACTIVE_PROJECT },
            _count: { _all: true },
          }),
        ]),
      ).then(([bugs, issues]) => {
        const out: Record<string, number> = {};
        for (const r of [...bugs, ...issues]) if (r.projectId) out[r.projectId] = (out[r.projectId] ?? 0) + r._count._all;
        extras.criticalByProject = out;
      }),
    );
  }

  if (reads.myTasks) {
    jobs.push(
      withTenant(ctx, (tx) =>
        tx.projectTask.findMany({
          where: { assigneeId: ctx.userId, status: { not: "Completed" }, approvalStatus: "Published", project: ACTIVE_PROJECT },
          select: {
            id: true,
            title: true,
            dueDate: true,
            projectId: true,
            project: { select: { name: true } },
            blockers: { where: { status: "Open" }, orderBy: { dateRaised: "asc" }, take: 1, select: { dateRaised: true, description: true } },
          },
          orderBy: [{ dueDate: "asc" }],
          take: 200,
        }),
      ).then(
        (rows) =>
          void (extras.myTasks = rows.map(
            (t): BriefTask => ({
              id: t.id,
              title: t.title,
              projectId: t.projectId,
              projectName: t.project.name,
              dueDate: t.dueDate,
              blockedSince: t.blockers[0]?.dateRaised ?? null,
              blockerText: t.blockers[0]?.description ?? null,
            }),
          )),
      ),
    );
  }

  if (reads.decisionsWaiting) {
    jobs.push(
      withTenant(ctx, (tx) => waitingDecisionsSummary(tx, 3)).then(
        (w) =>
          void (extras.decisionsWaiting = {
            count: w.total,
            titles: w.top.map((d) => d.title),
            firstId: w.top[0]?.id ?? null,
            overdue: w.dueDates.filter((d) => new Date(d) < now).length,
          }),
      ),
    );
  }

  if (reads.gatesWaiting) {
    jobs.push(
      listGateQueue(ctx, "approver").then((gates) => {
        const waiting = gates.filter((g) => g.approval === "submitted" && (role !== "HeadOfQA" || g.testing));
        extras.gatesWaiting = {
          count: waiting.length,
          oldestAt: waiting[0]?.submittedAt ? new Date(waiting[0].submittedAt) : null,
          names: waiting.map((g) => `${g.projectName} · ${g.gateName}`),
        };
      }),
    );
  }

  if (reads.gatesReturned) {
    jobs.push(
      listGateQueue(ctx, "mine").then(
        (gates) =>
          void (extras.gatesReturned = gates
            .filter((g) => g.approval === "returned")
            .map((g) => ({ statusId: g.statusId, projectId: g.projectId, projectName: g.projectName, gateName: g.gateName, note: g.decisionNote }))),
      ),
    );
  }

  await Promise.all(jobs);
  return extras;
}

/** The viewer's Daily Brief for the role they're viewing as, from the page's cockpit payload. */
export async function getDailyBrief(ctx: Ctx, role: ViewRole, projects: CockpitProject[], now = new Date()): Promise<{ brief: Brief; timeZone: string }> {
  const [timeZone, extras] = await Promise.all([getTenantTimeZone(ctx), getBriefExtras(ctx, role, projects, now)]);
  return { brief: buildBrief({ role, viewerId: ctx.userId, now, timeZone, projects, extras }), timeZone };
}
