import { derivedRag, projectRag, type Rag, type RagSignals } from "@/server/health";

// The cockpit's per-project six-axis RAG (Schedule/Budget/Scope/Risk/Resources/Quality).
// QUBIT stores no dimension ratings, so we DERIVE them from signals we already have — no new
// data entry. "N" = not rated (shown grey), used where we have no signal for that axis yet.
// Pure and unit-testable.

export type DimRag = "G" | "A" | "R" | "N";
export const DIMENSIONS = ["Schedule", "Budget", "Scope", "Risk", "Resources", "Quality"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type DimensionMap = Record<Dimension, DimRag>;

const short: Record<Rag, DimRag> = { Green: "G", Amber: "A", Red: "R" };

/** Signals available per project when assembling the cockpit (all optional — absent → N). */
export interface DimensionSignals {
  status: string;
  /** baseline target vs current forecast, in days of slip (forecast − target); >0 = late. */
  scheduleSlipDays?: number | null;
  targetPassed?: boolean;
  openRisks?: number;
  redRisks?: number;
  openBlockers?: number;
  /** allocation ratio of the project's people; >1 = over-committed. */
  overAllocated?: boolean;
  unassigned?: boolean;
  /** requirement coverage 0–1 (linked+published tasks ÷ requirements); null = no requirements. */
  requirementCoverage?: number | null;
  scopeChanging?: boolean;
  /** open QA defects / reopened count; null = no QA signal yet. */
  openDefects?: number | null;
  hasBudgetData?: boolean;
}

function scheduleDim(s: DimensionSignals): DimRag {
  if (s.status === "Completed" || s.status === "Cancelled") return "G";
  const slip = s.scheduleSlipDays ?? 0;
  if (s.targetPassed || slip > 30) return "R";
  if (slip > 0) return "A";
  return "G";
}

function riskDim(s: DimensionSignals): DimRag {
  if ((s.redRisks ?? 0) > 0) return "R";
  if ((s.openRisks ?? 0) > 0 || (s.openBlockers ?? 0) > 0) return "A";
  return "G";
}

function resourcesDim(s: DimensionSignals): DimRag {
  if (s.unassigned) return "R";
  if (s.overAllocated) return "A";
  return "G";
}

function scopeDim(s: DimensionSignals): DimRag {
  if (s.scopeChanging) return "R";
  if (s.requirementCoverage == null) return "N"; // no requirements tracked → no signal
  if (s.requirementCoverage < 0.5) return "A";
  return "G";
}

function qualityDim(s: DimensionSignals): DimRag {
  if (s.openDefects == null) return "N"; // no QA signal captured yet
  if (s.openDefects > 3) return "R";
  if (s.openDefects > 0) return "A";
  return "G";
}

/** Budget is intentionally "not rated" until QUBIT captures budget/spend data. */
function budgetDim(s: DimensionSignals): DimRag {
  return s.hasBudgetData ? "G" : "N";
}

export function deriveDimensions(s: DimensionSignals): DimensionMap {
  return {
    Schedule: scheduleDim(s),
    Budget: budgetDim(s),
    Scope: scopeDim(s),
    Risk: riskDim(s),
    Resources: resourcesDim(s),
    Quality: qualityDim(s),
  };
}

export const RAG_SHORT: Record<Rag, DimRag> = short;

/** Reported (typed status) vs calculated (derived signals) — the cockpit's dispute spine. */
export function ragPair(signals: RagSignals): { reported: DimRag; calculated: DimRag } {
  return { reported: short[projectRag(signals.status)], calculated: short[derivedRag(signals)] };
}

const ORDER: Record<DimRag, number> = { R: 0, A: 1, G: 2, N: 3 };

/** True when the PM reported greener than the signals calculate (sandbagging flag). */
export function isDispute(reported: DimRag, calculated: DimRag): boolean {
  return ORDER[reported] > ORDER[calculated];
}
