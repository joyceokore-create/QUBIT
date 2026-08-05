import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { businessDaysBetween, AGING_BUSINESS_DAYS } from "@/lib/board-lens";
import { isoWeekId, weekWindow } from "@/lib/iso-week";
import { emitDomainEvent } from "@/server/events";

/**
 * Member weekly report (docs/18 §5.1). The system drafts what it already knows from the
 * member's own board — done this week, still doing (with aging), blockers raised and
 * resolved — grouped per project. The member EDITS before sending: submitting is always
 * a human act, never a cron auto-send (§5.1.2). Submit routes one report to every
 * project lead involved; each lead acknowledges their own project's section (§5.1.3),
 * and acknowledged sections roll into that project's PM check-in (§5.1.4).
 */

export const MEMBER_REPORT_STATUSES = ["Draft", "Submitted", "Acknowledged"] as const;
export type MemberReportStatus = (typeof MEMBER_REPORT_STATUSES)[number];

export interface MemberReportItem {
  id: string;
  title: string;
  /** Board status at draft time (Completed | InProgress | InReview | InQA | NotStarted). */
  status: string;
  /** Only for still-open work: business days since last activity. */
  ageBusinessDays?: number;
  aging?: boolean;
}

export interface MemberReportSection {
  projectId: string;
  projectCode: string;
  projectName: string;
  done: MemberReportItem[];
  doing: MemberReportItem[];
  blockersRaised: string[];
  blockersResolved: string[];
  /** Auto-written summary lines; the member may edit or replace them. */
  lines: string[];
  /** The member's own additions for this project ("add more details", §5.1.2). */
  note: string | null;
  /** M-P3a (docs/25 §5.1) — a question or concern routed to the PM with the report. */
  query: string | null;
}

export interface MemberReportDraft {
  sections: MemberReportSection[];
}

/** Human summary lines for one project section — pure, so the wording is unit-testable. */
export function buildSectionLines(
  s: Omit<MemberReportSection, "lines" | "note" | "query" | "projectId" | "projectCode" | "projectName">,
): string[] {
  const lines: string[] = [];
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (s.done.length) lines.push(`Completed ${n(s.done.length, "item")} this week`);
  if (s.doing.length) {
    const aging = s.doing.filter((d) => d.aging).length;
    lines.push(
      aging
        ? `${n(s.doing.length, "item")} still in flight — ${aging} sitting over ${AGING_BUSINESS_DAYS} business days`
        : `${n(s.doing.length, "item")} still in flight`,
    );
  }
  if (s.blockersRaised.length) lines.push(`Raised ${n(s.blockersRaised.length, "blocker")}`);
  if (s.blockersResolved.length) lines.push(`Cleared ${n(s.blockersResolved.length, "blocker")}`);
  if (lines.length === 0) lines.push("No tracked movement on this project this week.");
  return lines;
}

/** Draft one member's week from their own board (tx-level: callable from jobs and routes). */
export async function computeMemberDraft(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<MemberReportDraft> {
  const { start } = weekWindow(now);

  const [memberships, led, tasks, blockers] = await Promise.all([
    tx.projectMember.findMany({ where: { userId }, select: { projectId: true } }),
    tx.project.findMany({ where: { leadUserId: userId }, select: { id: true } }),
    // The member's own cards: everything open, plus whatever they finished this week.
    tx.projectTask.findMany({
      where: {
        assigneeId: userId,
        approvalStatus: { not: "Draft" },
        OR: [{ status: { not: "Completed" } }, { status: "Completed", updatedAt: { gte: start } }],
      },
      select: {
        id: true, title: true, status: true, projectId: true, lastActivityAt: true,
        project: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { lastActivityAt: "desc" },
    }),
    tx.blocker.findMany({
      where: { ownerId: userId, OR: [{ dateRaised: { gte: start } }, { status: "Resolved", updatedAt: { gte: start } }] },
      select: { id: true, description: true, status: true, projectId: true, dateRaised: true },
    }),
  ]);

  const projectIds = new Set<string>([
    ...memberships.map((m) => m.projectId),
    ...led.map((p) => p.id),
    ...tasks.map((t) => t.projectId),
    ...blockers.map((b) => b.projectId),
  ]);
  if (!projectIds.size) return { sections: [] };

  const projects = await tx.project.findMany({
    where: { id: { in: [...projectIds] }, status: { notIn: ["Completed", "Cancelled"] } },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const sections: MemberReportSection[] = [];
  for (const p of projects) {
    const mine = tasks.filter((t) => t.projectId === p.id);
    const done = mine
      .filter((t) => t.status === "Completed")
      .map((t) => ({ id: t.id, title: t.title, status: t.status }));
    const doing = mine
      .filter((t) => t.status !== "Completed" && t.status !== "NotStarted")
      .map((t) => {
        const ageBusinessDays = businessDaysBetween(t.lastActivityAt, now);
        return { id: t.id, title: t.title, status: t.status, ageBusinessDays, aging: ageBusinessDays > AGING_BUSINESS_DAYS };
      });
    const mineBlockers = blockers.filter((b) => b.projectId === p.id);
    const blockersRaised = mineBlockers.filter((b) => b.dateRaised >= start).map((b) => b.description);
    const blockersResolved = mineBlockers.filter((b) => b.status === "Resolved").map((b) => b.description);

    // A project with nothing to say this week is left out — the report is what moved.
    if (!done.length && !doing.length && !blockersRaised.length && !blockersResolved.length) continue;

    const facts = { done, doing, blockersRaised, blockersResolved };
    sections.push({
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      ...facts,
      lines: buildSectionLines(facts),
      note: null,
      query: null,
    });
  }
  return { sections };
}

export interface MemberReportView {
  id: string | null; // null = computed draft, not yet persisted
  isoWeek: string;
  status: MemberReportStatus;
  draft: MemberReportDraft;
  narrative: string | null;
  submittedAt: Date | null;
  acks: { projectId: string; projectName: string; byName: string; comment: string | null; at: Date }[];
}

/** This week's report for the viewer — the persisted row when one exists, else a draft. */
export async function getMyReport(ctx: TenantContext, now = new Date()): Promise<MemberReportView> {
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const row = await tx.memberReport.findUnique({
      where: { tenantId_userId_isoWeek: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek } },
      include: {
        acks: {
          include: { project: { select: { name: true } }, acknowledgedBy: { select: { name: true } } },
          orderBy: { acknowledgedAt: "asc" },
        },
      },
    });
    if (row) {
      return {
        id: row.id,
        isoWeek,
        status: row.status as MemberReportStatus,
        draft: row.draft as unknown as MemberReportDraft,
        narrative: row.narrative,
        submittedAt: row.submittedAt,
        acks: row.acks.map((a) => ({
          projectId: a.projectId,
          projectName: a.project.name,
          byName: a.acknowledgedBy.name,
          comment: a.comment,
          at: a.acknowledgedAt,
        })),
      };
    }
    return {
      id: null,
      isoWeek,
      status: "Draft",
      draft: await computeMemberDraft(tx, ctx.userId, now),
      narrative: null,
      submittedAt: null,
      acks: [],
    };
  });
}

export class MemberReportError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN" | "ALREADY_SUBMITTED" | "EMPTY";
  constructor(message: string, code: MemberReportError["code"]) {
    super(message);
    this.code = code;
  }
}

export const SaveMemberReportInput = z.object({
  narrative: z.string().trim().max(1000).nullable().optional(),
  /** Per-project member additions, keyed by projectId. */
  notes: z.record(z.string(), z.string().trim().max(1000).nullable()).optional(),
  /** Edited summary lines, keyed by projectId — the member may rewrite the machine's words. */
  lines: z.record(z.string(), z.array(z.string().trim().max(300)).max(20)).optional(),
  /** M-P3a — queries & concerns to the PM, keyed by projectId. */
  queries: z.record(z.string(), z.string().trim().max(500).nullable()).optional(),
});
export type SaveMemberReportInputT = z.infer<typeof SaveMemberReportInput>;

/** Save the member's edits. Facts are NEVER overwritten by the client — only the
 * narrative, per-project notes and the (editable) summary lines. */
export async function saveMyReport(
  ctx: TenantContext,
  input: SaveMemberReportInputT,
  now = new Date(),
): Promise<MemberReportView> {
  await withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const existing = await tx.memberReport.findUnique({
      where: { tenantId_userId_isoWeek: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek } },
      select: { id: true, status: true, draft: true },
    });
    if (existing && existing.status !== "Draft") {
      throw new MemberReportError("This report has already been submitted.", "ALREADY_SUBMITTED");
    }
    const base = existing
      ? (existing.draft as unknown as MemberReportDraft)
      : await computeMemberDraft(tx, ctx.userId, now);

    const sections = base.sections.map((s) => ({
      ...s,
      note: input.notes?.[s.projectId] !== undefined ? (input.notes[s.projectId] ?? null) : s.note,
      query: input.queries?.[s.projectId] !== undefined ? (input.queries[s.projectId] ?? null) : (s.query ?? null),
      lines: input.lines?.[s.projectId] ?? s.lines,
    }));
    const data = {
      draft: { sections } as unknown as Prisma.InputJsonValue,
      narrative: input.narrative !== undefined ? input.narrative : (existing ? undefined : null),
    };
    await tx.memberReport.upsert({
      where: { tenantId_userId_isoWeek: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek, status: "Draft", ...data },
      update: data,
    });
  });
  return getMyReport(ctx, now);
}

/** Submit this week's report — routes to every involved project's lead/PM (§5.1.3). */
export async function submitMyReport(ctx: TenantContext, now = new Date()): Promise<MemberReportView> {
  await withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const existing = await tx.memberReport.findUnique({
      where: { tenantId_userId_isoWeek: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek } },
      select: { id: true, status: true, draft: true },
    });
    if (existing && existing.status !== "Draft") {
      throw new MemberReportError("This report has already been submitted.", "ALREADY_SUBMITTED");
    }
    const draft = existing
      ? (existing.draft as unknown as MemberReportDraft)
      : await computeMemberDraft(tx, ctx.userId, now);
    if (!draft.sections.length) {
      throw new MemberReportError("Nothing to report this week — no tracked movement.", "EMPTY");
    }

    const data = {
      status: "Submitted",
      submittedAt: now,
      draft: draft as unknown as Prisma.InputJsonValue,
    };
    const row = await tx.memberReport.upsert({
      where: { tenantId_userId_isoWeek: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, isoWeek, ...data },
      update: data,
    });

    const projectIds = draft.sections.map((s) => s.projectId);
    const leads = await leadUserIdsFor(tx, projectIds);
    const me = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });

    await audit(tx, ctx, {
      action: "update",
      entityType: "member_report",
      entityId: row.id,
      after: { isoWeek, status: "Submitted", projects: projectIds.length },
    });
    await emitDomainEvent(tx, ctx, {
      type: "member_report.submitted",
      entityType: "member_report",
      entityId: row.id,
      payload: { isoWeek, projectIds },
      // Every lead of an involved project is told — never the submitter themselves.
      notify: [...leads]
        .filter((id) => id !== ctx.userId)
        .map((userId) => ({
          userId,
          kind: "member_report",
          message: `${me?.name ?? "A team member"} submitted their weekly report`,
          link: `/reports?tab=team`,
        })),
    });
  });
  return getMyReport(ctx, now);
}

/** Lead + PM-member user ids for the given projects. */
async function leadUserIdsFor(tx: Prisma.TransactionClient, projectIds: string[]): Promise<Set<string>> {
  if (!projectIds.length) return new Set();
  const [projects, pms] = await Promise.all([
    tx.project.findMany({ where: { id: { in: projectIds } }, select: { leadUserId: true } }),
    tx.projectMember.findMany({
      where: { projectId: { in: projectIds }, role: "Project Manager" },
      select: { userId: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const p of projects) if (p.leadUserId) ids.add(p.leadUserId);
  for (const m of pms) ids.add(m.userId);
  return ids;
}

export interface TeamReportRow {
  id: string;
  userId: string;
  userName: string;
  isoWeek: string;
  status: MemberReportStatus;
  submittedAt: Date | null;
  /** The member's own words to their lead — the whole point of the edit step. */
  narrative: string | null;
  /** Only the sections for projects the VIEWER leads — each PM sees their own (§5.1.3). */
  sections: MemberReportSection[];
  /** Project ids in this report the viewer may acknowledge and hasn't yet. */
  pendingProjectIds: string[];
}

/** Submitted reports routed to the viewer as a project lead/PM. */
export async function listTeamReports(ctx: TenantContext, now = new Date()): Promise<TeamReportRow[]> {
  return withTenant(ctx, async (tx) => {
    const myProjectIds = await myLedProjectIds(tx, ctx.userId);
    if (!myProjectIds.size) return [];
    const isoWeek = isoWeekId(now);
    const rows = await tx.memberReport.findMany({
      where: { isoWeek, status: { in: ["Submitted", "Acknowledged"] }, userId: { not: ctx.userId } },
      include: { user: { select: { name: true } }, acks: { select: { projectId: true } } },
      orderBy: { submittedAt: "asc" },
    });
    return rows
      .map((row) => {
        const draft = row.draft as unknown as MemberReportDraft;
        const sections = (draft.sections ?? []).filter((s) => myProjectIds.has(s.projectId));
        if (!sections.length) return null;
        const acked = new Set(row.acks.map((a) => a.projectId));
        return {
          id: row.id,
          userId: row.userId,
          userName: row.user.name,
          isoWeek: row.isoWeek,
          status: row.status as MemberReportStatus,
          submittedAt: row.submittedAt,
          narrative: row.narrative,
          sections,
          pendingProjectIds: sections.map((s) => s.projectId).filter((id) => !acked.has(id)),
        };
      })
      .filter((r): r is TeamReportRow => r !== null);
  });
}

async function myLedProjectIds(tx: Prisma.TransactionClient, userId: string): Promise<Set<string>> {
  const [led, pm] = await Promise.all([
    tx.project.findMany({ where: { leadUserId: userId }, select: { id: true } }),
    tx.projectMember.findMany({ where: { userId, role: "Project Manager" }, select: { projectId: true } }),
  ]);
  return new Set([...led.map((p) => p.id), ...pm.map((m) => m.projectId)]);
}

export const AcknowledgeInput = z.object({
  projectId: z.string().uuid(),
  comment: z.string().trim().max(500).nullable().optional(),
});
export type AcknowledgeInputT = z.infer<typeof AcknowledgeInput>;

/** Acknowledge ONE project's section of a member's report (§5.1.4). The gate is
 * resource-scoped: only a lead/PM of THAT project, and only for a section the report
 * actually contains. */
export async function acknowledgeReport(
  ctx: TenantContext,
  reportId: string,
  input: AcknowledgeInputT,
  now = new Date(),
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.memberReport.findUnique({
      where: { id: reportId },
      select: { id: true, userId: true, isoWeek: true, status: true, draft: true },
    });
    if (!row) throw new MemberReportError("Report not found.", "NOT_FOUND");
    if (row.status === "Draft") throw new MemberReportError("That report has not been submitted yet.", "NOT_FOUND");

    const draft = row.draft as unknown as MemberReportDraft;
    if (!draft.sections?.some((s) => s.projectId === input.projectId)) {
      throw new MemberReportError("That report has no section for this project.", "NOT_FOUND");
    }
    const myProjectIds = await myLedProjectIds(tx, ctx.userId);
    if (!myProjectIds.has(input.projectId)) {
      throw new MemberReportError("Only the project's lead can acknowledge this section.", "FORBIDDEN");
    }

    await tx.memberReportAck.upsert({
      where: { memberReportId_projectId: { memberReportId: reportId, projectId: input.projectId } },
      create: {
        tenantId: ctx.tenantId,
        memberReportId: reportId,
        projectId: input.projectId,
        acknowledgedById: ctx.userId,
        comment: input.comment ?? null,
        acknowledgedAt: now,
      },
      update: { comment: input.comment ?? null, acknowledgedById: ctx.userId, acknowledgedAt: now },
    });

    // The report reads Acknowledged once every section it carries has been signed off.
    const acks = await tx.memberReportAck.findMany({ where: { memberReportId: reportId }, select: { projectId: true } });
    const allAcked = draft.sections.every((s) => acks.some((a) => a.projectId === s.projectId));
    if (allAcked && row.status !== "Acknowledged") {
      await tx.memberReport.update({ where: { id: reportId }, data: { status: "Acknowledged" } });
    }

    await audit(tx, ctx, {
      action: "update",
      entityType: "member_report",
      entityId: reportId,
      after: { acknowledgedProject: input.projectId, isoWeek: row.isoWeek, complete: allAcked },
    });
    const me = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    await emitDomainEvent(tx, ctx, {
      type: "member_report.acknowledged",
      entityType: "member_report",
      entityId: reportId,
      payload: { projectId: input.projectId, isoWeek: row.isoWeek },
      notify:
        row.userId === ctx.userId
          ? []
          : [
              {
                userId: row.userId,
                kind: "member_report",
                message: `${me?.name ?? "Your lead"} acknowledged your weekly report`,
                link: "/reports",
              },
            ],
    });
  });
}

/** Acknowledged member sections for a project this week — folded into the PM's
 * check-in draft (§5.1.4) so the weekly loop closes without re-typing. */
export async function acknowledgedMemberLines(
  tx: Prisma.TransactionClient,
  projectId: string,
  isoWeek: string,
): Promise<string[]> {
  const acks = await tx.memberReportAck.findMany({
    where: { projectId, memberReport: { isoWeek } },
    select: { memberReport: { select: { draft: true, user: { select: { name: true } } } } },
  });
  const lines: string[] = [];
  for (const a of acks) {
    const draft = a.memberReport.draft as unknown as MemberReportDraft;
    const section = draft.sections?.find((s) => s.projectId === projectId);
    if (!section) continue;
    const done = section.done.length;
    if (done) lines.push(`${a.memberReport.user.name}: ${done} item${done === 1 ? "" : "s"} completed`);
    if (section.note) lines.push(`${a.memberReport.user.name}: ${section.note}`);
  }
  return lines;
}

export interface MyReportListRow {
  isoWeek: string;
  status: MemberReportStatus;
  submittedAt: Date | null;
  narrative: string | null;
  projects: { projectId: string; projectCode: string; projectName: string }[];
  acks: number;
}

/** M-P3c (docs/34 §1) — the thin index's "my updates" list: my own weeks, newest
 * first. userId scoping on top of RLS — the index never shows anyone else's report. */
export async function listMyReports(ctx: TenantContext, take = 12): Promise<MyReportListRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.memberReport.findMany({
      where: { userId: ctx.userId },
      orderBy: { isoWeek: "desc" },
      take,
      include: { acks: { select: { id: true } } },
    });
    return rows.map((r) => {
      const draft = r.draft as unknown as MemberReportDraft;
      return {
        isoWeek: r.isoWeek,
        status: r.status as MemberReportStatus,
        submittedAt: r.submittedAt,
        narrative: r.narrative,
        projects: (draft.sections ?? []).map((s) => ({
          projectId: s.projectId,
          projectCode: s.projectCode,
          projectName: s.projectName,
        })),
        acks: r.acks.length,
      };
    });
  });
}
