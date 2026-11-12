import type { CsvColumn } from "@/lib/csv";
import { formatDayMonth } from "@/lib/dates";
import { isoWeekMonday } from "@/lib/iso-week";
import { matchesSearch } from "@/lib/list-state";

/**
 * UX9 (UX plan D13) — Reports › Quality, the pure part: one row per active project, the sort
 * (most critical first), the table's search + "In testing" filter, and the CSV contract. The
 * server shapes rows from `getQualityOverview` (src/server/quality.ts); the browser filters
 * and pages them. Client-safe.
 *
 * Pass rate is deliberately absent: QUBIT doesn't record test-case results yet.
 */

export interface QualityRow {
  id: string;
  name: string;
  code: string;
  pmName: string | null;
  /** The project's current gate (first not Done), "Complete", or null (no template). */
  stage: string | null;
  inTesting: boolean;
  /** Percent of accepted requirements with linked tests; null = no requirements. */
  coveragePct: number | null;
  /** Open Critical bugs + open Critical issues. */
  criticalOpen: number;
  openBugs: { high: number; medium: number; low: number };
  overdueTests: number;
  unassignedTests: number;
}

export interface WeeklyCount {
  isoWeek: string;
  opened: number;
}

/**
 * Most critical first: open critical issues, then open High bugs, then overdue test tasks,
 * then unassigned ones; ties by name (A–Z) so the order is stable between loads.
 */
export function sortQualityRows(rows: QualityRow[]): QualityRow[] {
  return [...rows].sort(
    (a, b) =>
      b.criticalOpen - a.criticalOpen ||
      b.openBugs.high - a.openBugs.high ||
      b.overdueTests - a.overdueTests ||
      b.unassignedTests - a.unassignedTests ||
      a.name.localeCompare(b.name),
  );
}

export const QUALITY_FILTERS = ["testing"] as const;
export type QualityFilter = "" | (typeof QUALITY_FILTERS)[number];

/** Search over project, code, PM and stage; "testing" keeps projects in a testing gate. */
export function filterQualityRows(rows: QualityRow[], q: string, filter: string): QualityRow[] {
  return rows.filter((r) => (filter !== "testing" || r.inTesting) && matchesSearch(q, r.name, r.code, r.pmName, r.stage));
}

/** "62%" or "—" when the project has no requirements to cover. */
export function coverageLabel(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

/** "W45" + "2 Nov" (the week's Monday, in the tenant's zone). Noon UTC so no zone shifts the day. */
export function weekLabel(isoWeek: string, timeZone: string): { short: string; monday: string } {
  const monday = new Date(isoWeekMonday(isoWeek).getTime() + 12 * 3_600_000);
  return { short: `W${isoWeek.split("-W")[1]}`, monday: formatDayMonth(monday, timeZone) };
}

/** The CSV export's contract — the on-screen table's columns, numbers unformatted. */
export const QUALITY_CSV_COLUMNS: CsvColumn<QualityRow>[] = [
  { header: "Project", value: (r) => r.name },
  { header: "Code", value: (r) => r.code },
  { header: "PM", value: (r) => r.pmName ?? "" },
  { header: "Stage", value: (r) => r.stage ?? "" },
  { header: "In testing", value: (r) => (r.inTesting ? "Yes" : "No") },
  { header: "Requirement coverage %", value: (r) => r.coveragePct ?? "" },
  { header: "Open critical issues", value: (r) => r.criticalOpen },
  { header: "Open bugs: High", value: (r) => r.openBugs.high },
  { header: "Open bugs: Medium", value: (r) => r.openBugs.medium },
  { header: "Open bugs: Low", value: (r) => r.openBugs.low },
  { header: "Overdue test tasks", value: (r) => r.overdueTests },
  { header: "Unassigned test tasks", value: (r) => r.unassignedTests },
];
