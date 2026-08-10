import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { isoWeekId } from "@/lib/iso-week";
import { absentUserIds } from "@/server/absence";
import { emitDomainEvent } from "@/server/events";
import { NUDGE_THRESHOLDS as T } from "@/server/nudger/config";
import { businessDaysBetween } from "@/lib/board-lens";

/**
 * The nudger (M3; matrix from docs/15 §6.4). Signals fire against live delivery data,
 * dedupe on `entityId:signal:isoWeek` — nobody is re-pinged daily for the same thing —
 * and escalation bumps the level (widening recipients), never duplicating the row.
 * Recipients on leave are excluded from M6 onward (absence-aware layer); per-user
 * snoozes are honoured here from day one.
 */

export const NUDGE_SIGNALS = [
  "task_due",
  "task_stale",
  "blocker_open",
  "drafts_pending",
  "bug_unassigned",
  "milestone_at_risk",
  "checkin_unconfirmed",
  "member_report_unsent",
  // DM1.73 (T8): the two THIS-week chasers — the prevWeek chasers above only catch
  // misses after the Friday 17:00 deadline has already passed.
  "member_report_unacknowledged",
  "checkin_unsent_to_head",
] as const;
export type NudgeSignal = (typeof NUDGE_SIGNALS)[number];


export interface NudgeCandidate {
  signal: NudgeSignal;
  entityType: string;
  entityId: string;
  projectId: string | null;
  message: string;
  link: string | null;
  /** Target escalation level right now (0 owner · 1 PM · 2 head). */
  level: number;
  /** Cumulative recipients per level; applying level N notifies levels 0..N. */
  recipientsByLevel: string[][];
}

interface PmSets {
  pmByProject: Map<string, string[]>;
  headsOfProjects: string[];
  headsOfQa: string[];
}

/** Lead + "Project Manager" members per project, plus tenant-wide head roles. */
async function resolveRecipients(tx: Prisma.TransactionClient): Promise<PmSets> {
  const [projects, heads] = await Promise.all([
    tx.project.findMany({
      select: {
        id: true,
        leadUserId: true,
        members: { where: { role: "Project Manager" }, select: { userId: true } },
      },
    }),
    tx.roleAssignment.findMany({
      where: { role: { in: ["HeadOfProjects", "HeadOfQA"] } },
      select: { userId: true, role: true },
    }),
  ]);
  const pmByProject = new Map<string, string[]>();
  for (const p of projects) {
    const set = new Set<string>(p.members.map((m) => m.userId));
    if (p.leadUserId) set.add(p.leadUserId);
    pmByProject.set(p.id, [...set]);
  }
  return {
    pmByProject,
    headsOfProjects: heads.filter((h) => h.role === "HeadOfProjects").map((h) => h.userId),
    headsOfQa: heads.filter((h) => h.role === "HeadOfQA").map((h) => h.userId),
  };
}

const day = 86_400_000;
const hour = 3_600_000;

/** Evaluate the docs/15 §6.4 matrix against live data. Exported for tests. */
export async function collectCandidates(tx: Prisma.TransactionClient, now: Date): Promise<NudgeCandidate[]> {
  const { pmByProject, headsOfProjects, headsOfQa } = await resolveRecipients(tx);
  const pm = (projectId: string) => pmByProject.get(projectId) ?? [];
  const candidates: NudgeCandidate[] = [];
  const published = { approvalStatus: { not: "Draft" } };

  const [dueTasks, staleTasks, openBlockers, draftGroups, unassignedBugs, milestones] = await Promise.all([
    tx.projectTask.findMany({
      where: { ...published, status: { not: "Completed" }, assigneeId: { not: null }, dueDate: { lt: new Date(now.getTime() + T.taskDueSoonHours * hour) } },
      select: { id: true, title: true, taskKey: true, dueDate: true, assigneeId: true, projectId: true, project: { select: { name: true } } },
    }),
    tx.projectTask.findMany({
      where: { ...published, status: { in: ["InProgress", "InReview"] }, lastActivityAt: { lt: new Date(now.getTime() - T.taskStaleBusinessDays * day) } },
      select: { id: true, title: true, taskKey: true, lastActivityAt: true, assigneeId: true, projectId: true, project: { select: { name: true } } },
    }),
    tx.blocker.findMany({
      where: { status: "Open", createdAt: { lt: new Date(now.getTime() - T.blockerOpenDays * day) } },
      select: { id: true, description: true, createdAt: true, ownerId: true, projectId: true, taskId: true, project: { select: { name: true } } },
    }),
    tx.projectTask.groupBy({
      by: ["projectId"],
      where: { approvalStatus: "Draft", createdAt: { lt: new Date(now.getTime() - T.draftsPendingHours * hour) } },
      _count: { _all: true },
    }),
    tx.projectTask.findMany({
      where: { ...published, type: "Bug", severity: { in: ["High", "Critical"] }, status: { not: "Completed" }, assigneeId: null, createdAt: { lt: new Date(now.getTime() - T.bugUnassignedHours * hour) } },
      select: { id: true, title: true, taskKey: true, severity: true, projectId: true, project: { select: { name: true } } },
    }),
    tx.projectMilestone.findMany({
      where: {
        status: { not: "Done" },
        dueDate: { gte: now, lt: new Date(now.getTime() + T.milestoneDueDays * day) },
        tasks: { some: { status: { not: "Completed" }, ...published } },
      },
      select: { id: true, name: true, dueDate: true, projectId: true, project: { select: { name: true } } },
    }),
  ]);

  const label = (t: { taskKey: string | null; title: string }) => t.taskKey ?? `"${t.title.slice(0, 60)}"`;
  const boardLink = (projectId: string, taskId: string) => `/projects/${projectId}?tab=Board&task=${taskId}`;

  for (const t of dueTasks) {
    const overdueDays = Math.floor((now.getTime() - (t.dueDate as Date).getTime()) / day);
    candidates.push({
      signal: "task_due",
      entityType: "project_task",
      entityId: t.id,
      projectId: t.projectId,
      message:
        overdueDays > 0
          ? `${label(t)} is ${overdueDays}d overdue on ${t.project.name}`
          : `${label(t)} is due within ${T.taskDueSoonHours}h on ${t.project.name}`,
      link: boardLink(t.projectId, t.id),
      level: overdueDays > T.taskOverdueEscalateDays ? 1 : 0,
      recipientsByLevel: [[t.assigneeId as string], pm(t.projectId)],
    });
  }

  for (const t of staleTasks) {
    const staleDays = businessDaysBetween(t.lastActivityAt, now);
    if (staleDays < T.taskStaleBusinessDays) continue; // calendar prefilter over-selects
    candidates.push({
      signal: "task_stale",
      entityType: "project_task",
      entityId: t.id,
      projectId: t.projectId,
      message: `${label(t)} has had no activity for ${staleDays} business days on ${t.project.name}`,
      link: boardLink(t.projectId, t.id),
      level: staleDays >= T.taskStaleEscalateBusinessDays ? 1 : 0,
      recipientsByLevel: [t.assigneeId ? [t.assigneeId] : pm(t.projectId), pm(t.projectId)],
    });
  }

  for (const b of openBlockers) {
    const ageDays = Math.floor((now.getTime() - b.createdAt.getTime()) / day);
    candidates.push({
      signal: "blocker_open",
      entityType: "blocker",
      entityId: b.id,
      projectId: b.projectId,
      message: `Blocker open ${ageDays}d on ${b.project.name}: ${b.description.slice(0, 80)}`,
      // DM1.73: the Deadlines tab retired with M-P3a — milestones live on Overview now.
      link: b.taskId ? boardLink(b.projectId, b.taskId) : `/projects/${b.projectId}?tab=Overview`,
      // docs/15 names only the 7-day head escalation; owner-level nudge until then,
      // then PM + HeadOfProjects together (recorded in DECISIONS.md).
      level: ageDays >= T.blockerHeadDays ? 2 : 0,
      recipientsByLevel: [b.ownerId ? [b.ownerId] : pm(b.projectId), pm(b.projectId), headsOfProjects],
    });
  }

  for (const g of draftGroups) {
    const projectName = (await tx.project.findUnique({ where: { id: g.projectId }, select: { name: true } }))?.name ?? "a project";
    candidates.push({
      signal: "drafts_pending",
      entityType: "project",
      entityId: g.projectId,
      projectId: g.projectId,
      message: `${g._count._all} AI draft${g._count._all === 1 ? "" : "s"} awaiting approval on ${projectName} for over ${T.draftsPendingHours}h`,
      link: `/projects/${g.projectId}?tab=Board`,
      level: 0,
      recipientsByLevel: [pm(g.projectId)],
    });
  }

  for (const b of unassignedBugs) {
    candidates.push({
      signal: "bug_unassigned",
      entityType: "project_task",
      entityId: b.id,
      projectId: b.projectId,
      message: `${b.severity} bug unassigned on ${b.project.name}: ${label(b)}`,
      link: boardLink(b.projectId, b.id) + "&lens=qa",
      level: 0,
      recipientsByLevel: [[...new Set([...pm(b.projectId), ...headsOfQa])]],
    });
  }

  for (const m of milestones) {
    candidates.push({
      signal: "milestone_at_risk",
      entityType: "project_milestone",
      entityId: m.id,
      projectId: m.projectId,
      message: `Milestone "${m.name}" due ${m.dueDate!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} on ${m.project.name} with open tasks`,
      // DM1.73: the Deadlines tab retired with M-P3a — milestones live on Overview now.
      link: `/projects/${m.projectId}?tab=Overview`,
      level: 0,
      recipientsByLevel: [pm(m.projectId)],
    });
  }

  // DM1.73 (T8): THIS week's loop, not just last week's post-mortem. Both signals ride
  // the ordinary weekday-morning `nudger` job (deployment.md: 07:30 Mon–Fri) and the
  // standard `entityId:signal:isoWeek` dedupe — one ping per week, escalation-free.
  const isoWeek = isoWeekId(now);

  // A submitted member report a lead/PM has not acknowledged yet. Same lookup shape as
  // collectMemberReportChase, but for the CURRENT week and routed to the leads of the
  // still-pending sections instead of the member — the report is theirs to sign off.
  const unackedReports = await tx.memberReport.findMany({
    where: { isoWeek, status: "Submitted" },
    select: {
      id: true,
      userId: true,
      draft: true,
      user: { select: { name: true } },
      acks: { select: { projectId: true } },
    },
  });
  for (const r of unackedReports) {
    const draft = r.draft as { sections?: { projectId: string }[] } | null;
    const acked = new Set(r.acks.map((a) => a.projectId));
    const pending = (draft?.sections ?? []).map((s) => s.projectId).filter((id) => !acked.has(id));
    // Never nudge the author about their own report (a PM allocated to a project they
    // lead files a member section for it too).
    const recipients = [...new Set(pending.flatMap((id) => pm(id)))].filter((id) => id !== r.userId);
    if (!recipients.length) continue;
    candidates.push({
      signal: "member_report_unacknowledged",
      entityType: "member_report",
      entityId: r.id,
      projectId: pending.length === 1 ? pending[0] : null,
      message: `${r.user.name}'s weekly report is waiting for your acknowledgement`,
      link: "/reports?tab=team",
      level: 0,
      recipientsByLevel: [recipients],
    });
  }

  // This week's check-in Confirmed but never "Sent to the Head" (M-P3a's
  // `submittedToHeadAt`), so the Head's roll-up would flag it UNSENT. Friday 17:00 is the
  // promised deadline; the nudger cron only runs weekday MORNINGS, so the simplest honest
  // gate is day-of-week — fire from Friday onward in the ISO week (Fri/Sat/Sun). Under
  // the current crontab that means Friday's 07:30 run; a check-in confirmed later on
  // Friday is only caught if an afternoon run is scheduled — stated here, not faked
  // with a wider window.
  const dow = now.getUTCDay(); // 0 Sun … 6 Sat — UTC, like isoWeekId/weekWindow
  if (dow === 5 || dow === 6 || dow === 0) {
    const unsentCheckins = await tx.checkIn.findMany({
      where: {
        isoWeek,
        status: "Confirmed",
        submittedToHeadAt: null,
        project: { status: { notIn: ["Completed", "Cancelled"] } },
      },
      select: { id: true, projectId: true, project: { select: { name: true } } },
    });
    for (const c of unsentCheckins) {
      candidates.push({
        signal: "checkin_unsent_to_head",
        entityType: "check_in",
        entityId: c.id,
        projectId: c.projectId,
        message: `${c.project.name}'s check-in is confirmed but was never sent to the Head — send it before the roll-up`,
        link: `/projects/${c.projectId}?tab=Reports`,
        level: 0,
        recipientsByLevel: [pm(c.projectId)],
      });
    }
  }

  return candidates;
}

/** Last week's check-ins still unconfirmed — chased Monday morning (§7 honest-by-default). */
export async function collectCheckinChase(tx: Prisma.TransactionClient, now: Date): Promise<NudgeCandidate[]> {
  const { pmByProject } = await resolveRecipients(tx);
  const prevWeek = isoWeekId(new Date(now.getTime() - 7 * day));
  const stale = await tx.checkIn.findMany({
    where: { isoWeek: prevWeek, status: "Draft", project: { status: { notIn: ["Completed", "Cancelled"] } } },
    select: { id: true, projectId: true, project: { select: { name: true } } },
  });
  return stale.map((c) => ({
    signal: "checkin_unconfirmed" as const,
    entityType: "check_in",
    entityId: c.id,
    projectId: c.projectId,
    message: `Last week's check-in for ${c.project.name} was never confirmed — the report showed computed status`,
    link: `/projects/${c.projectId}`,
    level: 0,
    recipientsByLevel: [pmByProject.get(c.projectId) ?? []],
  }));
}

/** Last week's member reports still sitting in Draft — chased Monday 10:00 (docs/18
 * §5.1.5). The nudge goes to the member who owns the draft; nobody else is pinged for
 * a report that is theirs to send. */
export async function collectMemberReportChase(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<NudgeCandidate[]> {
  const prevWeek = isoWeekId(new Date(now.getTime() - 7 * day));
  const stale = await tx.memberReport.findMany({
    where: { isoWeek: prevWeek, status: "Draft" },
    select: { id: true, userId: true, isoWeek: true },
  });
  return stale.map((r) => ({
    signal: "member_report_unsent" as const,
    entityType: "member_report",
    entityId: r.id,
    projectId: null,
    message: `Your ${r.isoWeek} weekly report is still a draft — review and send it`,
    link: "/reports",
    level: 0,
    recipientsByLevel: [[r.userId]],
  }));
}

/** Create-or-escalate with weekly dedupe. Returns what happened for observability. */
export async function applyCandidates(
  tx: Prisma.TransactionClient,
  machineCtx: Pick<TenantContext, "tenantId" | "userId">,
  candidates: NudgeCandidate[],
  now: Date,
): Promise<{ created: number; escalated: number; skipped: number }> {
  const isoWeek = isoWeekId(now);
  const snoozes = await tx.nudgeSnooze.findMany({ where: { until: { gt: now } }, select: { userId: true, entityId: true, signal: true } });
  const snoozed = new Set(snoozes.map((s) => `${s.userId}:${s.entityId}:${s.signal}`));
  const quiet = (c: NudgeCandidate, userIds: string[]) => userIds.filter((u) => !snoozed.has(`${u}:${c.entityId}:${c.signal}`));

  // docs/16 §5 — never nudge somebody who is on leave: it is how you teach a team to
  // ignore nudges. The nudge is not dropped, though; it REROUTES to the project's PM,
  // because the thing still needs doing.
  const absent = await absentUserIds(tx, now);
  const { pmByProject } = await resolveRecipients(tx);
  const present = (c: NudgeCandidate, userIds: string[]): string[] => {
    if (!absent.size) return userIds;
    const here = userIds.filter((u) => !absent.has(u));
    const away = userIds.filter((u) => absent.has(u));
    if (!away.length) return here;
    const standIns = (c.projectId ? (pmByProject.get(c.projectId) ?? []) : []).filter((u) => !absent.has(u));
    return [...new Set([...here, ...standIns])];
  };

  let created = 0;
  let escalated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const dedupeKey = `${c.entityId}:${c.signal}:${isoWeek}`;
    const recipients = present(c, [...new Set(c.recipientsByLevel.slice(0, c.level + 1).flat())]);
    if (recipients.length === 0) {
      skipped++;
      continue;
    }
    const existing = await tx.nudge.findUnique({
      where: { tenantId_dedupeKey: { tenantId: machineCtx.tenantId, dedupeKey } },
      select: { id: true, escalationLevel: true, recipientIds: true },
    });

    if (!existing) {
      const row = await tx.nudge.create({
        data: {
          tenantId: machineCtx.tenantId,
          dedupeKey,
          signal: c.signal,
          entityType: c.entityType,
          entityId: c.entityId,
          projectId: c.projectId,
          isoWeek,
          message: c.message,
          link: c.link,
          escalationLevel: c.level,
          recipientIds: recipients,
        },
      });
      created++;
      await emitDomainEvent(tx, machineCtx, {
        type: "nudge.created",
        entityType: "nudge",
        entityId: row.id,
        payload: { signal: c.signal, projectId: c.projectId, level: c.level },
        notify: quiet(c, recipients).map((userId) => ({ userId, kind: "nudge", message: c.message, link: c.link ?? undefined })),
      });
      continue;
    }

    if (c.level > existing.escalationLevel) {
      const added = recipients.filter((r) => !existing.recipientIds.includes(r));
      await tx.nudge.update({
        where: { id: existing.id },
        data: {
          escalationLevel: c.level,
          recipientIds: [...new Set([...existing.recipientIds, ...recipients])],
          message: c.message,
          sentAt: now,
        },
      });
      escalated++;
      await emitDomainEvent(tx, machineCtx, {
        type: "nudge.escalated",
        entityType: "nudge",
        entityId: existing.id,
        payload: { signal: c.signal, projectId: c.projectId, level: c.level },
        // Only the newly-pulled-in recipients get pinged — the owner was already nudged.
        notify: quiet(c, added).map((userId) => ({ userId, kind: "nudge", message: `Escalated: ${c.message}`, link: c.link ?? undefined })),
      });
      continue;
    }
    skipped++;
  }

  if (created + escalated > 0) {
    await audit(tx, machineCtx, {
      action: "create",
      entityType: "nudge",
      entityId: isoWeek,
      after: { created, escalated },
    });
  }
  return { created, escalated, skipped };
}

export interface MyNudge {
  id: string;
  signal: NudgeSignal;
  message: string;
  link: string | null;
  escalationLevel: number;
  projectId: string | null;
  entityId: string;
}

/** The viewer's active (unsnoozed) nudges for the current week, most severe first. */
export async function listMyNudges(ctx: TenantContext, now = new Date()): Promise<MyNudge[]> {
  return withTenant(ctx, async (tx) => {
    const [rows, snoozes] = await Promise.all([
      tx.nudge.findMany({
        where: { isoWeek: isoWeekId(now), recipientIds: { has: ctx.userId } },
        orderBy: [{ escalationLevel: "desc" }, { sentAt: "desc" }],
      }),
      tx.nudgeSnooze.findMany({ where: { userId: ctx.userId, until: { gt: now } }, select: { entityId: true, signal: true } }),
    ]);
    const snoozed = new Set(snoozes.map((s) => `${s.entityId}:${s.signal}`));
    return rows
      .filter((r) => !snoozed.has(`${r.entityId}:${r.signal}`))
      .map((r) => ({
        id: r.id,
        signal: r.signal as NudgeSignal,
        message: r.message,
        link: r.link,
        escalationLevel: r.escalationLevel,
        projectId: r.projectId,
        entityId: r.entityId,
      }));
  });
}

/** Current-week nudges for Q (`list_nudges`) — tenant-wide under global read (DM1.3). */
export async function listNudges(ctx: TenantContext, projectId?: string, now = new Date()) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.nudge.findMany({
      where: { isoWeek: isoWeekId(now), ...(projectId ? { projectId } : {}) },
      orderBy: [{ escalationLevel: "desc" }, { sentAt: "desc" }],
      take: 30,
      include: { project: { select: { code: true, name: true } } },
    });
    return rows.map((r) => ({
      signal: r.signal,
      message: r.message,
      escalationLevel: r.escalationLevel,
      project: r.project ? `${r.project.name} (${r.project.code})` : null,
    }));
  });
}

export class SnoozeError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "SnoozeError";
  }
}

/** Snooze one nudge for the caller only — days defaults per config, capped at 30. */
export async function snoozeNudge(ctx: TenantContext, nudgeId: string, days: number = T.defaultSnoozeDays, now = new Date()) {
  const until = new Date(now.getTime() + Math.min(Math.max(days, 1), 30) * day);
  return withTenant(ctx, async (tx) => {
    const nudge = await tx.nudge.findUnique({ where: { id: nudgeId }, select: { entityId: true, signal: true, recipientIds: true } });
    if (!nudge) throw new SnoozeError("Nudge not found.", "NOT_FOUND");
    if (!nudge.recipientIds.includes(ctx.userId)) throw new SnoozeError("You can only snooze your own nudges.", "FORBIDDEN");
    await tx.nudgeSnooze.upsert({
      where: { tenantId_userId_entityId_signal: { tenantId: ctx.tenantId, userId: ctx.userId, entityId: nudge.entityId, signal: nudge.signal } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, entityId: nudge.entityId, signal: nudge.signal, until },
      update: { until },
    });
    await audit(tx, ctx, { action: "update", entityType: "nudge", entityId: nudgeId, after: { snoozedUntil: until } });
    return { until };
  });
}
