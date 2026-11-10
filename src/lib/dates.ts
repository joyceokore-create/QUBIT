/**
 * One date format everywhere, in the tenant's time zone (UX plan U5, Q3).
 *
 *   formatDate        → "9 Nov 2026"
 *   formatDayMonth    → "9 Nov"
 *   formatDateTime    → "Fri 13 Nov, 17:00"
 *   formatTime        → "17:00"
 *
 * Never the server's clock or the browser's default locale: every helper takes the tenant's
 * IANA zone (Tenant.timeZone, default Africa/Nairobi) and formats with en-GB. Pure and
 * client-safe; a server component reads the zone once and passes it down.
 */

/** Riverbank's zone, and the default for any tenant that hasn't set one. */
export const DEFAULT_TIME_ZONE = "Africa/Nairobi";

/** True for a zone the runtime's Intl data knows (so a bad setting can't crash a page). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zone(tz?: string | null): string {
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

function parts(d: DateInput, tz: string | null | undefined, opts: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: zone(tz) }).formatToParts(toDate(d))) {
    out[p.type] = p.value;
  }
  return out;
}

/** "9 Nov 2026" */
export function formatDate(d: DateInput, tz?: string | null): string {
  const p = parts(d, tz, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}`;
}

/** "9 Nov" — for dates inside the current year where the year is noise. */
export function formatDayMonth(d: DateInput, tz?: string | null): string {
  const p = parts(d, tz, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}

/** "17:00" (24-hour). */
export function formatTime(d: DateInput, tz?: string | null): string {
  const p = parts(d, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.hour}:${p.minute}`;
}

/** "Fri 13 Nov, 17:00" */
export function formatDateTime(d: DateInput, tz?: string | null): string {
  const p = parts(d, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** The calendar day ("2026-11-09") an instant falls on in the tenant's zone — the key for
 * "is this today / overdue" comparisons, so 23:30 UTC on the 8th is the 9th in Nairobi. */
export function dayKey(d: DateInput, tz?: string | null): string {
  const p = parts(d, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** True when `d` falls on the same tenant-local calendar day as `now`. */
export function isSameDay(d: DateInput, now: DateInput, tz?: string | null): boolean {
  return dayKey(d, tz) === dayKey(now, tz);
}

/** True when `due` is on a tenant-local day before `now`'s (due today is not overdue). */
export function isOverdue(due: DateInput, now: DateInput, tz?: string | null): boolean {
  return dayKey(due, tz) < dayKey(now, tz);
}
