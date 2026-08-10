// Shared, client-safe presentation helpers for the QUBIT App v3 project surfaces
// (Dashboard delivery ledger + Projects table). Pure functions — no server imports — so
// they run in both server and client components.

export const PROJECT_STATUS_META: Record<string, { label: string; tok: string }> = {
  OnTrack: { label: "ON TRACK", tok: "--ok" },
  AtRisk: { label: "AT RISK", tok: "--warn" },
  Overdue: { label: "OVERDUE", tok: "--bad" },
  Planning: { label: "PLANNING", tok: "--qinfo" },
  Completed: { label: "DONE", tok: "--ok" },
  Cancelled: { label: "CANCELLED", tok: "--ink4" },
};

export function statusMeta(status: string): { label: string; tok: string } {
  return PROJECT_STATUS_META[status] ?? { label: status.toUpperCase(), tok: "--ink4" };
}

/** Worst-status-first ordering. */
export function projectRank(status: string): number {
  return { Overdue: 5, AtRisk: 4, Planning: 3, OnTrack: 2, Completed: 1, Cancelled: 0 }[status] ?? 0;
}

/** Progress bar colour token for a status. */
export function statusBarTok(status: string): string {
  return status === "Overdue" ? "--bad" : status === "AtRisk" ? "--warn" : status === "Planning" ? "--qinfo" : "--ok";
}
