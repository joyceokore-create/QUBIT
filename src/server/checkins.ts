import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { isoWeekId, weekWindow } from "@/lib/iso-week";
import { avgProgress } from "@/server/dashboard";
import { emitDomainEvent } from "@/server/events";
import { projectRag, type Rag } from "@/server/health";
import { acknowledgedMemberLines } from "@/server/member-reports";

/**
 * Friday check-ins (M2, docs/16-revamp-plan.md §7). The system drafts the weekly status
 * from the outbox + snapshots — the lead never types what QUBIT already knows. The lead
 * reviews, writes ONE narrative line, and confirms. A RAG override needs a reason and
 * expires after 7 days (an override that outlives its week is a stale opinion, not a
 * status). The confirmed check-in IS the project's line in the Friday report.
 */

export const RAGS = ["Green", "Amber", "Red"] as const;

export interface CheckInDraft {
  tasksCompleted: number;
  blockersOpened: number;
  blockersResolved: number;
  milestonesDone: string[];
  milestonesSlipped: string[];
  overdueTasks: number;
  progress: number;
  progressDelta: number | null;
  lines: string[];
}

/** Human bullet lines from the week's facts — pure, so the wording is unit-testable. */
export function buildDraftLines(d: Omit<CheckInDraft, "lines">): string[] {
  const lines: string[] = [];
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (d.tasksCompleted) lines.push(`${n(d.tasksCompleted, "task")} completed this week`);
  if (d.blockersOpened) lines.push(`${n(d.blockersOpened, "blocker")} opened`);
  if (d.blockersResolved) lines.push(`${n(d.blockersResolved, "blocker")} resolved`);
  for (const m of d.milestonesDone.slice(0, 3)) lines.push(`Milestone done: ${m}`);
  for (const m of d.milestonesSlipped.slice(0, 3)) lines.push(`Milestone slipped: ${m}`);
  if (d.overdueTasks) lines.push(`${n(d.overdueTasks, "task")} overdue right now`);
  if (d.progressDelta !== null && d.progressDelta !== 0) {
    lines.push(`Progress ${d.progressDelta > 0 ? "+" : ""}${d.progressDelta}% (now ${d.progress}%)`);
  }
  if (lines.length === 0) lines.push("A quiet week — no tracked movement.");
  return lines;
}

/** The override wins only while it is confirmed, present, and unexpired. */
export function effectiveRag(
  row: { status: string; computedRag: string; ragOverride: string | null; overrideExpiresAt: Date | null },
  now = new Date(),
): Rag {
  if (row.status === "Confirmed" && row.ragOverride && row.overrideExpiresAt && row.overrideExpiresAt > now) {
    return row.ragOverride as Rag;
  }
  return row.computedRag as Rag;
}

/** Compute this week's facts for a project (tx-level: callable from jobs and routes). */
export async function computeCheckInDraft(
  tx: Prisma.TransactionClient,
  projectId: string,
  now = new Date(),
): Promise<{ computedRag: Rag; draft: CheckInDraft }> {
  const { start } = weekWindow(now);
  const eventCount = (type: string) =>
    tx.domainEvent.count({
      where: { type, createdAt: { gte: start }, payload: { path: ["projectId"], equals: projectId } },
    });

  const [project, tasksCompleted, blockersOpened, blockersResolved, msDone, msSlipped, overdueTasks, prevSnapshot] =
    await Promise.all([
      tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { status: true, orgStatuses: { select: { progress: true } } },
      }),
      eventCount("task.completed"),
      eventCount("blocker.opened"),
      eventCount("blocker.resolved"),
      tx.projectMilestone.findMany({
        where: { projectId, status: "Done", updatedAt: { gte: start } },
        select: { name: true },
      }),
      tx.projectMilestone.findMany({
        where: { projectId, status: { not: "Done" }, dueDate: { gte: start, lt: now } },
        select: { name: true },
      }),
      tx.projectTask.count({
        where: { projectId, approvalStatus: { not: "Draft" }, status: { not: "Completed" }, dueDate: { lt: now } },
      }),
      tx.projectSnapshot.findFirst({
        where: { projectId, day: { lt: start } },
        orderBy: { day: "desc" },
        select: { progress: true },
      }),
    ]);

  const progress = avgProgress(project);
  const facts = {
    tasksCompleted,
    blockersOpened,
    blockersResolved,
    milestonesDone: msDone.map((m) => m.name),
    milestonesSlipped: msSlipped.map((m) => m.name),
    overdueTasks,
    progress,
    progressDelta: prevSnapshot ? progress - prevSnapshot.progress : null,
  };
  // docs/18 §5.1.4 — member reports the PM already acknowledged roll into the check-in,
  // so the lead never re-types what their team told them. Acknowledged only: an unread
  // report is not yet the PM's word.
  const memberLines = await acknowledgedMemberLines(tx, projectId, isoWeekId(now));
  return {
    computedRag: projectRag(project.status),
    draft: { ...facts, lines: [...buildDraftLines(facts), ...memberLines] },
  };
}

export interface CheckInView {
  id: string | null; // null = ephemeral draft, not yet persisted
  isoWeek: string;
  status: "Draft" | "Confirmed";
  computedRag: Rag;
  effectiveRag: Rag;
  lines: string[];
  narrative: string | null;
  ragOverride: string | null;
  overrideReason: string | null;
  overrideExpiresAt: Date | null;
  confirmedByName: string | null;
  confirmedAt: Date | null;
  /** M-P3a — when the PM sent this confirmed check-in to the Head; null = not sent. */
  submittedToHeadAt: Date | null;
}

/** This week's check-in — the persisted row when one exists, else a computed draft. */
export async function getCurrentCheckIn(ctx: TenantContext, projectId: string, now = new Date()): Promise<CheckInView> {
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const row = await tx.checkIn.findUnique({
      where: { tenantId_projectId_isoWeek: { tenantId: ctx.tenantId, projectId, isoWeek } },
      include: { confirmedBy: { select: { name: true } } },
    });
    if (row) {
      const draft = row.draft as unknown as CheckInDraft;
      return {
        id: row.id,
        isoWeek,
        status: row.status as "Draft" | "Confirmed",
        computedRag: row.computedRag as Rag,
        effectiveRag: effectiveRag(row, now),
        lines: draft.lines ?? [],
        narrative: row.narrative,
        ragOverride: row.ragOverride,
        overrideReason: row.overrideReason,
        overrideExpiresAt: row.overrideExpiresAt,
        confirmedByName: row.confirmedBy?.name ?? null,
        confirmedAt: row.confirmedAt,
        submittedToHeadAt: row.submittedToHeadAt,
      };
    }
    const { computedRag, draft } = await computeCheckInDraft(tx, projectId, now);
    return {
      id: null,
      isoWeek,
      status: "Draft",
      computedRag,
      effectiveRag: computedRag,
      lines: draft.lines,
      narrative: null,
      ragOverride: null,
      overrideReason: null,
      overrideExpiresAt: null,
      confirmedByName: null,
      confirmedAt: null,
      submittedToHeadAt: null,
    };
  });
}

export const ConfirmCheckInInput = z
  .object({
    narrative: z.string().trim().min(1, "The narrative line is the human part — say something.").max(500),
    ragOverride: z.enum(RAGS).optional(),
    overrideReason: z.string().trim().max(300).optional(),
  })
  .refine((v) => !v.ragOverride || (v.overrideReason && v.overrideReason.length >= 5), {
    message: "A RAG override needs a reason.",
    path: ["overrideReason"],
  });
export type ConfirmCheckInInputT = z.infer<typeof ConfirmCheckInInput>;

const OVERRIDE_TTL_MS = 7 * 24 * 3_600_000;

/** Confirm this week's check-in (caller must already hold canWriteProject). Facts are
 * recomputed at confirm time so what the lead signs is what the report shows. */
export async function confirmCheckIn(
  ctx: TenantContext,
  projectId: string,
  input: ConfirmCheckInInputT,
  now = new Date(),
): Promise<CheckInView> {
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const { computedRag, draft } = await computeCheckInDraft(tx, projectId, now);
    const override = input.ragOverride && input.ragOverride !== computedRag ? input.ragOverride : null;
    const data = {
      status: "Confirmed",
      computedRag,
      draft: draft as unknown as Prisma.InputJsonValue,
      narrative: input.narrative,
      ragOverride: override,
      overrideReason: override ? (input.overrideReason ?? null) : null,
      overrideExpiresAt: override ? new Date(now.getTime() + OVERRIDE_TTL_MS) : null,
      confirmedById: ctx.userId,
      confirmedAt: now,
      // M-P3a: a re-confirmed (changed) report must be RE-sent to the Head.
      submittedToHeadAt: null,
    };
    const row = await tx.checkIn.upsert({
      where: { tenantId_projectId_isoWeek: { tenantId: ctx.tenantId, projectId, isoWeek } },
      create: { tenantId: ctx.tenantId, projectId, isoWeek, ...data },
      update: data,
      include: { confirmedBy: { select: { name: true } } },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "check_in",
      entityId: row.id,
      after: { isoWeek, rag: effectiveRag(row, now), override: override ?? undefined, confirmed: true },
    });
    await emitDomainEvent(tx, ctx, {
      type: "checkin.confirmed",
      entityType: "check_in",
      entityId: row.id,
      payload: { projectId, isoWeek, rag: effectiveRag(row, now), overridden: !!override },
    });
    return {
      id: row.id,
      isoWeek,
      status: "Confirmed",
      computedRag,
      effectiveRag: effectiveRag(row, now),
      lines: draft.lines,
      narrative: row.narrative,
      ragOverride: row.ragOverride,
      overrideReason: row.overrideReason,
      overrideExpiresAt: row.overrideExpiresAt,
      confirmedByName: row.confirmedBy?.name ?? null,
      confirmedAt: row.confirmedAt,
      submittedToHeadAt: row.submittedToHeadAt,
    };
  });
}

/** M-P3a (docs/34) — the PM sends this week's CONFIRMED check-in up the chain. The Head
 * roll-up (M-P3b) builds from submitted reports; re-confirming resets the stamp. */
export async function submitCheckInToHead(ctx: TenantContext, projectId: string, now = new Date()) {
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const row = await tx.checkIn.findUnique({
      where: { tenantId_projectId_isoWeek: { tenantId: ctx.tenantId, projectId, isoWeek } },
      include: { project: { select: { code: true, name: true } } },
    });
    if (!row || row.status !== "Confirmed") {
      throw new Error("Confirm the check-in first — the Head reviews what you signed.");
    }
    const updated = await tx.checkIn.update({
      where: { id: row.id },
      data: { submittedToHeadAt: now },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "check_in",
      entityId: row.id,
      after: { isoWeek, submittedToHead: true },
    });
    const heads = await tx.roleAssignment.findMany({
      where: { role: "HeadOfProjects" },
      select: { userId: true },
    });
    await emitDomainEvent(tx, ctx, {
      type: "checkin.submitted_to_head",
      entityType: "check_in",
      entityId: row.id,
      payload: { projectId, isoWeek },
      notify: [...new Set(heads.map((h) => h.userId))]
        .filter((id) => id !== ctx.userId)
        .map((userId) => ({
          userId,
          kind: "checkin.submitted_to_head",
          message: `${row.project.code} sent its week ${isoWeek.split("-W")[1]} report for your roll-up.`,
          link: "/dashboard?persona=executive",
        })),
    });
    return updated;
  });
}

export interface PastReportRow {
  id: string;
  isoWeek: string;
  rag: Rag;
  narrative: string | null;
  confirmedAt: Date | null;
  submittedToHeadAt: Date | null;
}

/** The workspace Reports tab's history: this project's confirmed check-ins, newest first. */
export async function listProjectReports(ctx: TenantContext, projectId: string, take = 12): Promise<PastReportRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.checkIn.findMany({
      where: { projectId, status: "Confirmed" },
      orderBy: { isoWeek: "desc" },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      isoWeek: r.isoWeek,
      rag: effectiveRag(r, new Date()),
      narrative: r.narrative,
      confirmedAt: r.confirmedAt,
      submittedToHeadAt: r.submittedToHeadAt,
    }));
  });
}

export interface ReportIndexRow {
  projectId: string;
  code: string;
  name: string;
  /** M-D2 — the reports index groups by portfolio, so the row carries its own. */
  portfolioName: string;
  pmName: string | null;
  latest: { isoWeek: string; status: "Confirmed" | "Draft"; rag: Rag; sentToHead: boolean } | null;
}

/** M-P3c (docs/34 §1) — the thin index's project-reports rows: the Head (and
 * SuperAdmin) see every active project, a PM sees the projects they lead. Each row
 * carries the LATEST check-in of any week so the index can deep-link into the
 * workspace Reports tab — authoring never happens on the index. */
export async function listReportIndex(ctx: TenantContext, now = new Date()): Promise<ReportIndexRow[]> {
  const seesAll = ctx.roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin");
  return withTenant(ctx, async (tx) => {
    const projects = await tx.project.findMany({
      where: {
        status: { notIn: ["Completed", "Cancelled"] },
        ...(seesAll ? {} : { leadUserId: ctx.userId }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        lead: { select: { name: true } },
        portfolio: { select: { name: true } },
        checkIns: { orderBy: { isoWeek: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    });
    return projects.map((p) => {
      const ci = p.checkIns[0];
      return {
        projectId: p.id,
        code: p.code,
        name: p.name,
        portfolioName: p.portfolio?.name ?? "Unassigned",
        pmName: p.lead?.name ?? null,
        latest: ci
          ? {
              isoWeek: ci.isoWeek,
              status: ci.status === "Confirmed" ? ("Confirmed" as const) : ("Draft" as const),
              rag: effectiveRag(ci, now),
              sentToHead: Boolean(ci.submittedToHeadAt),
            }
          : null,
      };
    });
  });
}

export interface CheckInProvenance {
  /** Members on the project this week (excluding the PM themselves). */
  teamSize: number;
  /** Member reports submitted for THIS project this week. */
  submitted: number;
  /** …of which the PM has acknowledged. */
  acknowledged: number;
  /** Names of members who owe an update — stated plainly, never silently ignored. */
  pendingNames: string[];
  /** Gate ticks feeding the computed status. */
  checkpointsDone: number;
  checkpointsTotal: number;
  /** Open RAID items that colour the RAG. */
  openBlockers: number;
  openRisks: number;
  /** Roll-up state for this week — the third rung of the rail. */
  rollupApproved: boolean;
}

/**
 * docs/25 §5 / the workflow wireframe's "Rolls up from" panel — what the computed
 * check-in is actually made of, so the PM narrates over visible provenance instead of
 * trusting a number. Unconfirmed contributors are NAMED: the chain never pretends a
 * silent week is a green one.
 */
export async function getCheckInProvenance(
  ctx: TenantContext,
  projectId: string,
  now = new Date(),
): Promise<CheckInProvenance> {
  const isoWeek = isoWeekId(now);
  return withTenant(ctx, async (tx) => {
    const [members, reports, gates, blockers, risks, rollup] = await Promise.all([
      tx.projectMember.findMany({
        // Retired people keep their membership rows (soft delete preserves references),
        // but they cannot owe a weekly update — counting them would inflate "still to
        // send" with "Deleted user" and make the honesty line dishonest.
        where: { projectId, role: { not: "Project Manager" }, user: { status: { not: "DELETED" } } },
        select: { userId: true, user: { select: { name: true } } },
      }),
      tx.memberReport.findMany({
        where: { isoWeek, status: { in: ["Submitted", "Acknowledged"] } },
        select: { userId: true, draft: true, acks: { select: { projectId: true } } },
      }),
      tx.checkpointStatus.findMany({ where: { projectId, orgUnitId: null }, select: { state: true } }),
      tx.blocker.count({ where: { projectId, status: "Open" } }),
      tx.risk.count({ where: { projectId, status: { not: "Closed" } } }),
      tx.portfolioReport.findUnique({
        where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
        select: { status: true },
      }),
    ]);

    // A report counts for THIS project only when it carries a section for it.
    const forProject = reports.filter((r) => {
      const sections = (r.draft as unknown as { sections?: { projectId: string }[] }).sections ?? [];
      return sections.some((s) => s.projectId === projectId);
    });
    const submittedIds = new Set(forProject.map((r) => r.userId));
    const acknowledged = forProject.filter((r) => r.acks.some((a) => a.projectId === projectId)).length;

    return {
      teamSize: members.length,
      submitted: forProject.length,
      acknowledged,
      pendingNames: members.filter((m) => !submittedIds.has(m.userId)).map((m) => m.user?.name ?? "Unnamed"),
      checkpointsDone: gates.filter((g) => g.state === "Done").length,
      checkpointsTotal: gates.length,
      openBlockers: blockers,
      openRisks: risks,
      rollupApproved: rollup?.status === "Approved",
    };
  });
}
