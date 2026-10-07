/**
 * ISO-8601 week helpers (M2 weekly loop). A check-in belongs to exactly one ISO week
 * ("2026-W31"); the week window is Monday 00:00 UTC → next Monday 00:00 UTC, which is
 * also the event/snapshot query range the drafts are computed over.
 */

/** ISO week id for a date, e.g. "2026-W31". Week 1 contains the year's first Thursday. */
export function isoWeekId(date: Date): string {
  // Thursday of this date's ISO week determines the ISO year.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export interface WeekWindow {
  isoWeek: string;
  /** Monday 00:00 UTC of the date's ISO week. */
  start: Date;
  /** Next Monday 00:00 UTC (exclusive). */
  end: Date;
}

export function weekWindow(date: Date): WeekWindow {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  const start = new Date(d.getTime() - (dow - 1) * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { isoWeek: isoWeekId(date), start, end };
}

/** "6–10 Oct" or "29 Sep – 3 Oct" — the working week (Mon–Fri) a report speaks about. */
export function weekRange(now: Date): string {
  const { start } = weekWindow(now);
  const fri = new Date(start.getTime() + 4 * 86_400_000);
  const day = (d: Date) => d.getUTCDate();
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return mon(start) === mon(fri) ? `${day(start)}–${day(fri)} ${mon(fri)}` : `${day(start)} ${mon(start)} – ${day(fri)} ${mon(fri)}`;
}

// ── Milestone B: week-id arithmetic for the /reports week switcher ──
const WEEK_ID = /^(\d{4})-W(\d{2})$/;
const WEEK_MS = 7 * 86_400_000;

function parseIsoWeek(id: string): { year: number; week: number } | null {
  const m = WEEK_ID.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53 || year < 2000 || year > 2100) return null;
  return { year, week };
}

/** Jan 4 is always in W01: its ISO Monday + (week − 1) × 7 days. */
function mondayOf(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (dow - 1) * 86_400_000);
  return new Date(mondayW1.getTime() + (week - 1) * WEEK_MS);
}

/** True for a well-formed id naming a real week — W53 only in 53-week years (round-trips
 * through isoWeekId, so no weeks-in-year table). */
export function isValidIsoWeek(id: string): boolean {
  const p = parseIsoWeek(id);
  return p !== null && isoWeekId(mondayOf(p.year, p.week)) === id;
}

/** Monday 00:00 UTC of "YYYY-Www". Throws on an invalid id — callers validate first. */
export function isoWeekMonday(id: string): Date {
  const p = parseIsoWeek(id);
  if (!p || isoWeekId(mondayOf(p.year, p.week)) !== id) throw new RangeError(`Not an ISO week id: ${id}`);
  return mondayOf(p.year, p.week);
}

/** "2026-W41" + (−1) → "2026-W40"; year boundaries fall out of isoWeekId. */
export function shiftIsoWeek(id: string, n: number): string {
  return isoWeekId(new Date(isoWeekMonday(id).getTime() + n * WEEK_MS));
}
