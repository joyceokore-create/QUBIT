import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Absence (docs/16 §5). "When a project member is on leave, QUBIT knows and reacts."
 * One table feeds every reaction — capacity maths, on-leave badges, and the nudger —
 * so the app can never be leave-aware in one place and blind in another.
 *
 * SOURCE-AGNOSTIC on purpose: `source` distinguishes manual entry (ships now) from a
 * CSV/ICS import or a read-only ERP pull (M6-B). The ERP stays the system of record —
 * QUBIT never writes leave back to it.
 */

export const ABSENCE_TYPES = ["Leave", "Sick", "Training", "Other"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];
export const ABSENCE_SOURCES = ["manual", "import", "erp"] as const;

const DAY = 86_400_000;

/** Working days (Mon–Fri) in [from, to] inclusive. Pure — the capacity maths is testable. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to < from) return 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let days = 0;
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Working days of an absence that fall inside a window — the overlap capacity loses. */
export function absenceWorkingDaysInWindow(
  absence: { startDate: Date; endDate: Date },
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = absence.startDate > windowStart ? absence.startDate : windowStart;
  const end = absence.endDate < windowEnd ? absence.endDate : windowEnd;
  return workingDaysBetween(start, end);
}

/**
 * Availability across a window, 0–1. Capacity is scaled by the working days a person is
 * actually there: somebody away all week is 0 available, not "100% allocated".
 * Overlapping absences are unioned by day so double-booked leave can't drive it negative.
 */
export function availabilityFactor(
  absences: { startDate: Date; endDate: Date }[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const total = workingDaysBetween(windowStart, windowEnd);
  if (total === 0) return 1;
  const awayDays = new Set<string>();
  for (const a of absences) {
    const start = a.startDate > windowStart ? new Date(a.startDate) : new Date(windowStart);
    const end = a.endDate < windowEnd ? new Date(a.endDate) : new Date(windowEnd);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) awayDays.add(cursor.toISOString().slice(0, 10));
    }
  }
  return Math.max(0, (total - awayDays.size) / total);
}

export interface AbsenceRow {
  id: string;
  userId: string;
  userName: string;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
  source: string;
  note: string | null;
}

/** Absences overlapping a window (defaults to the next 30 days from `now`). */
export async function listAbsences(
  ctx: TenantContext,
  opts: { userId?: string; from?: Date; to?: Date } = {},
  now = new Date(),
): Promise<AbsenceRow[]> {
  const from = opts.from ?? now;
  const to = opts.to ?? new Date(now.getTime() + 30 * DAY);
  return withTenant(ctx, async (tx) => {
    const rows = await tx.absence.findMany({
      where: {
        ...(opts.userId ? { userId: opts.userId } : {}),
        // Overlap, not containment: a leave spanning the whole window still counts.
        startDate: { lte: to },
        endDate: { gte: from },
      },
      select: {
        id: true, userId: true, type: true, startDate: true, endDate: true, source: true, note: true,
        user: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      type: r.type as AbsenceType,
      startDate: r.startDate,
      endDate: r.endDate,
      source: r.source,
      note: r.note,
    }));
  });
}

/** Everyone away on `now` — the set the nudger consults before pinging anybody. */
export async function absentUserIds(tx: Prisma.TransactionClient, now = new Date()): Promise<Set<string>> {
  const rows = await tx.absence.findMany({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export interface AssignmentAlternate {
  userId: string;
  name: string;
  role: string;
  /** Their booked allocation — lowest first, so the suggestion is the least loaded. */
  totalPct: number;
}

export interface AssignmentWarning {
  /** The assignee is away on the task's due date. */
  conflict: boolean;
  /** When they are back — the sentence the UI shows. */
  until: Date | null;
  /** Same-role project members who ARE around then, least loaded first (docs/16 §5). */
  alternates: AssignmentAlternate[];
}

/**
 * docs/16 §5 — "assigning a task due inside someone's leave window triggers a warning +
 * suggested alternates (same project role, lowest utilization)". A WARNING, never a
 * block: the PM may know something the calendar does not. Returns conflict=false when
 * there is no due date, no assignee, or they are around.
 */
export async function assignmentWarning(
  ctx: TenantContext,
  projectId: string,
  assigneeId: string | null | undefined,
  dueDate: Date | null | undefined,
): Promise<AssignmentWarning> {
  const none: AssignmentWarning = { conflict: false, until: null, alternates: [] };
  if (!assigneeId || !dueDate) return none;

  return withTenant(ctx, async (tx) => {
    const clash = await tx.absence.findFirst({
      where: { userId: assigneeId, startDate: { lte: dueDate }, endDate: { gte: dueDate } },
      select: { endDate: true },
      orderBy: { endDate: "desc" },
    });
    if (!clash) return none;

    // Alternates: same role on this project, not themselves, and present on the day.
    const mine = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { role: true },
    });
    const peers = mine
      ? await tx.projectMember.findMany({
          where: { projectId, role: mine.role, userId: { not: assigneeId } },
          select: { userId: true, role: true, user: { select: { name: true } } },
        })
      : [];
    const peerIds = peers.map((p) => p.userId);
    const [busyThatDay, loads] = await Promise.all([
      peerIds.length
        ? tx.absence.findMany({
            where: { userId: { in: peerIds }, startDate: { lte: dueDate }, endDate: { gte: dueDate } },
            select: { userId: true },
          })
        : [],
      peerIds.length
        ? tx.projectMember.groupBy({ by: ["userId"], where: { userId: { in: peerIds } }, _sum: { allocationPct: true } })
        : [],
    ]);
    const away = new Set(busyThatDay.map((a) => a.userId));
    const loadByUser = new Map(loads.map((l) => [l.userId, l._sum.allocationPct ?? 0]));

    const alternates = peers
      .filter((p) => !away.has(p.userId))
      .map((p) => ({ userId: p.userId, name: p.user.name, role: p.role, totalPct: loadByUser.get(p.userId) ?? 0 }))
      .sort((a, b) => a.totalPct - b.totalPct)
      .slice(0, 3);

    return { conflict: true, until: clash.endDate, alternates };
  });
}

export interface LeaveExposure {
  peopleAway: number;
  /** Projects losing the most people next week, worst first. */
  projects: { projectName: string; away: number; members: number }[];
}

/** docs/16 §5 — next week's exposure for the Friday report: "3 members on leave next
 * week; Mobile Banking loses 40% of its team." Counts PEOPLE, not percentages of an
 * allocation nobody typed — the honest figure with the data we have. */
export async function leaveExposureNextWeek(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<LeaveExposure> {
  const start = new Date(now.getTime() + DAY);
  const end = new Date(now.getTime() + 8 * DAY);
  const absences = await tx.absence.findMany({
    where: { startDate: { lte: end }, endDate: { gte: start } },
    select: { userId: true },
  });
  const awayIds = new Set(absences.map((a) => a.userId));
  if (!awayIds.size) return { peopleAway: 0, projects: [] };

  const members = await tx.projectMember.findMany({
    where: { project: { status: { notIn: ["Completed", "Cancelled"] } } },
    select: { userId: true, projectId: true, project: { select: { name: true } } },
  });
  const byProject = new Map<string, { projectName: string; away: number; members: number }>();
  for (const m of members) {
    const row = byProject.get(m.projectId) ?? { projectName: m.project.name, away: 0, members: 0 };
    row.members += 1;
    if (awayIds.has(m.userId)) row.away += 1;
    byProject.set(m.projectId, row);
  }
  return {
    peopleAway: awayIds.size,
    projects: [...byProject.values()]
      .filter((p) => p.away > 0)
      .sort((a, b) => b.away / b.members - a.away / a.members)
      .slice(0, 5),
  };
}

export class AbsenceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "AbsenceError";
  }
}

export const CreateAbsenceInput = z
  .object({
    userId: z.string().uuid(),
    type: z.enum(ABSENCE_TYPES),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => new Date(v.endDate) >= new Date(v.startDate), {
    message: "The last day away cannot be before the first.",
    path: ["endDate"],
  });
export type CreateAbsenceInputT = z.infer<typeof CreateAbsenceInput>;

/** Record an absence by hand (source=manual) — the day-one path, zero dependencies. */
export async function createAbsence(ctx: TenantContext, input: CreateAbsenceInputT): Promise<AbsenceRow[]> {
  // The shape rules live HERE, not only at the route, so every caller — routes, jobs,
  // the future CSV/ERP importers — gets them. A route-only guard is one import away
  // from being bypassed.
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AbsenceError("Those dates are not valid.", "BAD_INPUT");
  }
  if (end < start) {
    throw new AbsenceError("The last day away cannot be before the first.", "BAD_INPUT");
  }

  await withTenant(ctx, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true } });
    if (!user) throw new AbsenceError("Person not found.", "NOT_FOUND");
    const row = await tx.absence.create({
      data: {
        tenantId: ctx.tenantId,
        userId: input.userId,
        type: input.type,
        startDate: start,
        endDate: end,
        source: "manual",
        note: input.note ?? null,
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "absence",
      entityId: row.id,
      after: { userId: input.userId, type: input.type, startDate: input.startDate, endDate: input.endDate },
    });
  });
  return listAbsences(ctx, { userId: input.userId });
}

/** Remove an absence — only manual rows; imported/ERP rows belong to their source. */
export async function deleteAbsence(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.absence.findUnique({ where: { id }, select: { id: true, source: true, userId: true } });
    if (!row) throw new AbsenceError("Absence not found.", "NOT_FOUND");
    if (row.source !== "manual") {
      throw new AbsenceError("That absence came from the HR source — change it there.", "BAD_INPUT");
    }
    await tx.absence.delete({ where: { id } });
    await audit(tx, ctx, { action: "delete", entityType: "absence", entityId: id, before: { userId: row.userId } });
  });
}
