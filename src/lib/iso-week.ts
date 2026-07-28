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
