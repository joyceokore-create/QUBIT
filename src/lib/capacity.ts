// DM1.73 — the ONE capacity-warning implementation (docs/29 §3 "Warning rules").
// Previously duplicated near-identically in the project wizard's Team step and the
// assign-members dialog; both now call this pure function, so the two surfaces can
// never drift on what counts as over-allocated.

export interface CapacityCandidate {
  name?: string;
  /** Typed allocation across projects. */
  totalPct?: number | null;
  /** Leave-aware allocation (docs/16 §5) — preferred over totalPct when present. */
  effectivePct?: number | null;
  /** Set while the person is away — the "on leave until" badge source. */
  onLeaveUntil?: string | Date | null;
  /** Days of approved leave inside the request window (bench rows carry this). */
  awayDaysInWindow?: number;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Capacity/leave warnings for assigning `alloc`% to `candidate` over `window`.
 * Informative, never blocking (docs/26 §4.3) — callers show them and send accepted
 * ones to the server for the audit blob. Uses effectivePct (leave-aware) when the
 * caller has it, falling back to the typed totalPct.
 */
export function assignmentWarnings(
  candidate: CapacityCandidate,
  alloc: number,
  window?: { start?: string | Date | null; end?: string | Date | null },
): string[] {
  const out: string[] = [];
  const who = candidate.name ?? "This person";
  const booked = candidate.effectivePct ?? candidate.totalPct ?? 0;
  const projected = booked + alloc;
  if (projected > 100) out.push(`${who} would be at ${projected}% (over-allocated)`);

  if (candidate.onLeaveUntil) {
    const back = new Date(candidate.onLeaveUntil);
    const start = window?.start ? new Date(window.start) : null;
    // No start date means "starts now" — the leave clashes by definition.
    if (!start || Number.isNaN(+start) || start <= back) {
      out.push(`${who} is on leave until ${fmtDate(back)}`);
    }
  }
  if ((candidate.awayDaysInWindow ?? 0) > 0) {
    out.push(`${who} has ${candidate.awayDaysInWindow}d of leave in this window`);
  }
  return out;
}
