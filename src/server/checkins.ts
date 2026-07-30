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
    };
  });
}
