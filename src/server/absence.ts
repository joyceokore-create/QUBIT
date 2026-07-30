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

/** userId → the date they are back, for everyone away ON `now`. Drives the badges. */
export async function onLeaveUntilByUser(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<Map<string, Date>> {
  const rows = await tx.absence.findMany({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { userId: true, endDate: true },
  });
  const out = new Map<string, Date>();
  for (const r of rows) {
    const current = out.get(r.userId);
    // If someone has stacked absences, the badge shows the furthest return date.
    if (!current || r.endDate > current) out.set(r.userId, r.endDate);
  }
  return out;
}

/** Everyone away on `now` — the set the nudger consults before pinging anybody. */
export async function absentUserIds(tx: Prisma.TransactionClient, now = new Date()): Promise<Set<string>> {
  const rows = await tx.absence.findMany({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
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
