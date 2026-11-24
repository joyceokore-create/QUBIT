/**
 * UX5 — the bucketed filters some list pages offer (UX plan L1 filter table). Pure and
 * client-safe, so the browser-paged tables filter ALL rows with the same rules the tests pin.
 */

// ── Ideas › Submitted ───────────────────────────────────────────────────────────
// Rolling windows, not calendar weeks/months: "Last 7 days" means the same thing on a
// Monday and a Friday, and needs no time-zone maths at the boundary.
export const SUBMITTED_BUCKETS = ["week", "month", "older"] as const;
export type SubmittedBucket = (typeof SUBMITTED_BUCKETS)[number];
export const SUBMITTED_LABEL: Record<SubmittedBucket, string> = {
  week: "Last 7 days",
  month: "Last 30 days",
  older: "Over 30 days ago",
};

const DAY_MS = 86_400_000;

/**
 * Does a submission date fall in the chosen window? "week" and "month" overlap on purpose
 * (a 3-day-old idea is in both); "older" is everything before the last 30 days. A future
 * date (clock skew) counts as just submitted. An empty filter matches everything.
 */
export function matchesSubmitted(filter: string, submittedAt: Date | string, now: Date | number = Date.now()): boolean {
  if (!filter) return true;
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = Math.max(0, new Date(now).getTime() - t);
  switch (filter) {
    case "week":
      return age <= 7 * DAY_MS;
    case "month":
      return age <= 30 * DAY_MS;
    case "older":
      return age > 30 * DAY_MS;
    default:
      return true;
  }
}

// ── People › Workload ───────────────────────────────────────────────────────────
// On the leave-aware effective allocation (what the Allocation column shows first).
export const WORKLOAD_BUCKETS = ["under", "full", "over"] as const;
export type WorkloadBucket = (typeof WORKLOAD_BUCKETS)[number];
export const WORKLOAD_LABEL: Record<WorkloadBucket, string> = {
  under: "Under 50%",
  full: "50–100%",
  over: "Over 100%",
};

/** Under 50% · 50–100% (both ends included) · over 100%. */
export function workloadBucket(pct: number): WorkloadBucket {
  if (pct > 100) return "over";
  if (pct >= 50) return "full";
  return "under";
}
