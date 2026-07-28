/**
 * The ONE health engine (docs/16-revamp-plan.md §10). Every surface that states whether
 * a project — or the portfolio — is healthy calls THIS module, so the dashboard, Q (live
 * and mock) and reports can never disagree; tests/rls/health-parity.test.ts enforces it.
 * Today the input is the project's delivery status field; the M2 check-in work swaps the
 * input for derived signals (tasks, milestones, blockers) and only this file changes.
 */

export type Rag = "Green" | "Amber" | "Red";

/** Canonical project RAG. Planning/OnTrack/Completed/Cancelled read Green — they are
 * either healthy or not in delivery; only live trouble colours a project. */
export function projectRag(status: string): Rag {
  if (status === "Overdue") return "Red";
  if (status === "AtRisk") return "Amber";
  return "Green";
}

/** True when the project belongs in every "needs attention" list. */
export function needsAttention(status: string): boolean {
  return projectRag(status) !== "Green";
}

/** Sort weight for "most troubled first" orderings. */
export function ragRank(status: string): number {
  const rag = projectRag(status);
  return rag === "Red" ? 3 : rag === "Amber" ? 2 : 0;
}

export interface PortfolioHealth {
  total: number;
  /** Delivering healthily: OnTrack + Completed. */
  onTrack: number;
  /** projectRag ≠ Green: AtRisk + Overdue. */
  needAttention: number;
  /** Not (yet / any longer) in delivery: Planning + Cancelled. */
  planning: number;
  /** onTrack ÷ total, 0–100 (0 for an empty portfolio). */
  pct: number;
}

/** Portfolio rollup — the exec-dashboard grouping, canonicalised. */
export function portfolioHealth(statuses: string[]): PortfolioHealth {
  const by = (s: string) => statuses.filter((x) => x === s).length;
  const onTrack = by("OnTrack") + by("Completed");
  const needAttention = statuses.filter((s) => needsAttention(s)).length;
  const planning = by("Planning") + by("Cancelled");
  const total = statuses.length;
  return { total, onTrack, needAttention, planning, pct: total ? Math.round((onTrack / total) * 100) : 0 };
}

/** Heatmap/portfolio-card classification: worst of {Overdue, At Risk, On Track} present —
 * Planning items fall through to "OnTrack", matching the exec reference design exactly. */
export function worstStatus(statuses: string[]): "OnTrack" | "AtRisk" | "Overdue" {
  if (statuses.includes("Overdue")) return "Overdue";
  if (statuses.includes("AtRisk")) return "AtRisk";
  return "OnTrack";
}

export function ragCounts(items: { status: string }[]) {
  return {
    onTrack: items.filter((i) => i.status === "OnTrack").length,
    atRisk: items.filter((i) => i.status === "AtRisk").length,
    overdue: items.filter((i) => i.status === "Overdue").length,
  };
}
