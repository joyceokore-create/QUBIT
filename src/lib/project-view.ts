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

/**
 * 8-cell stage-gate strip derived from progress + status: passed cells (stD), one active
 * cell (stL when the project is late/at-risk, else stA), then pending cells (stP).
 */
export function gateCells(pct: number, status: string): string[] {
  const passed = Math.max(0, Math.min(8, Math.round((pct / 100) * 8)));
  const late = status === "AtRisk" || status === "Overdue";
  const active = status === "Completed" ? "--stD" : late ? "--stL" : "--stA";
  return Array.from({ length: 8 }, (_, i) => (i < passed ? "--stD" : i === passed ? active : "--stP"));
}
