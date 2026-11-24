/**
 * UX5 (L4) — small pure helpers the server-paged list queries share. Client-safe (no Prisma),
 * unit-tested in tests/unit/list-query.test.ts.
 */
import { formatDate } from "@/lib/dates";

/**
 * Escape LIKE/ILIKE wildcards in user search text. Prisma's `contains` passes the value
 * straight into `ILIKE '%' || $1 || '%'` WITHOUT escaping, so a search for "%" or "_" would
 * match every row. Postgres' default LIKE escape character is the backslash.
 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Case-insensitive "contains" for a Prisma string filter, wildcards escaped. */
export function containsText(q: string): { contains: string; mode: "insensitive" } {
  return { contains: escapeLike(q), mode: "insensitive" };
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written "YYYY-MM-DD" (rejects 2026-02-30, 2026-13-01, …). */
export function isDayKey(s: string | null | undefined): s is string {
  if (!s) return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Offset (ms) of `tz` from UTC at the instant `t`: local wall clock minus UTC. */
function zoneOffsetMs(t: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - (t - (t % 1000));
}

/**
 * The UTC instant at which the calendar day `day` ("YYYY-MM-DD") starts in `tz`.
 * E.g. 2026-11-09 in Africa/Nairobi (UTC+3) starts at 2026-11-08T21:00:00Z. Handles DST
 * zones by re-checking the offset at the candidate instant.
 */
export function startOfDayInZone(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  let t = wallMidnight - zoneOffsetMs(wallMidnight, tz);
  const again = wallMidnight - zoneOffsetMs(t, tz);
  if (again !== t) t = again;
  return new Date(t);
}

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface DayRange {
  /** Inclusive lower bound: the start of the `from` day in the zone. */
  gte?: Date;
  /** Exclusive upper bound: the start of the day AFTER `to` in the zone. */
  lt?: Date;
  /** The validated day keys, in order (swapped when given backwards). */
  from?: string;
  to?: string;
}

/**
 * A date-range filter read as tenant-local days: `from` and `to` are whole days in `tz`,
 * both inclusive. Invalid days are dropped; a backwards range is swapped.
 */
export function dayRange(from: string | null | undefined, to: string | null | undefined, tz: string): DayRange {
  let f = isDayKey(from) ? from : undefined;
  let t = isDayKey(to) ? to : undefined;
  if (f && t && f > t) [f, t] = [t, f];
  return {
    ...(f && { gte: startOfDayInZone(f, tz), from: f }),
    ...(t && { lt: startOfDayInZone(nextDay(t), tz), to: t }),
  };
}

/** "9 Nov 2026" for a day key, without any zone shift (the key already IS the local day). */
export function formatDayKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return formatDate(new Date(Date.UTC(y, m - 1, d, 12)), "UTC");
}
