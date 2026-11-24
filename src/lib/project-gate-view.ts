import { GATE_KEYS, stageOf, type GateMap, type GateState } from "@/lib/cockpit-gates";
import { matchesSearch } from "@/lib/list-state";

/**
 * UX8 — Projects › Gate view. The stage-gate tracker as a view on Projects: one row per
 * project on the "Product build" template's real gates (BRD · Prototype · MVP1 · SIT · UAT ·
 * Go-Live), read from checkpoint records (set by PMs or by status-report uploads). Pure and
 * client-safe: the server shapes each row from the cockpit assembler, the client filters.
 */

/** Column headers — the template's own gate names (the cockpit abbreviates Prototype). */
export const GATE_VIEW_LABELS: Record<(typeof GATE_KEYS)[number], string> = {
  brd: "BRD",
  proto: "Prototype",
  mvp1: "MVP1",
  sit: "SIT",
  uat: "UAT",
  golive: "Go-Live",
};

/** The word every gate cell carries (U4 — colour is never the only signal). */
export const GATE_STATE_WORD: Record<GateState, string> = {
  done: "Done",
  prog: "In progress",
  late: "Overdue",
  block: "Blocked",
  none: "Not started",
};

// ── Health (shared with the List) ──────────────────────────────────────────────

/** docs/38 m2 — health is this week's CONFIRMED check-in; none confirmed reads "No report". */
export const HEALTH_ORDER = ["Red", "Amber", "Green", "None"] as const;
export type HealthBucket = (typeof HEALTH_ORDER)[number];
export const HEALTH_LABEL: Record<HealthBucket, string> = { Green: "On track", Amber: "At risk", Red: "Off track", None: "No report" };

export function healthOf(checkin: { rag: "Green" | "Amber" | "Red"; confirmed: boolean } | null): HealthBucket {
  return checkin?.confirmed ? checkin.rag : "None";
}

// ── Furthest-behind market ─────────────────────────────────────────────────────

export interface MarketTrack {
  code: string;
  name: string;
  pct: number;
  gates: GateMap;
}

const countOf = (gates: GateMap, state: GateState) => GATE_KEYS.filter((k) => gates[k] === state).length;

/**
 * A project rolling out to several markets shows ONE row: its furthest-behind market, so the
 * view never hides a lagging market behind a healthy average. The rule, in order:
 *  1. fewest Done gates (least advanced on the template);
 *  2. tie → the one with more Blocked cells, then more Late cells (the stuck one is "behind");
 *  3. tie → the lower progress %;
 *  4. tie → market code A–Z, so the choice is stable between loads.
 * Returns null when there are no markets (the project's own track is shown instead).
 */
export function furthestBehindMarket<M extends MarketTrack>(markets: M[]): M | null {
  if (!markets.length) return null;
  return [...markets].sort(
    (a, b) =>
      countOf(a.gates, "done") - countOf(b.gates, "done") ||
      countOf(b.gates, "block") - countOf(a.gates, "block") ||
      countOf(b.gates, "late") - countOf(a.gates, "late") ||
      a.pct - b.pct ||
      a.code.localeCompare(b.code),
  )[0]!;
}

// ── Row shaping ────────────────────────────────────────────────────────────────

/** The slice of a CockpitProject the Gate view reads. */
export interface GateSource {
  gates: GateMap;
  currentGate: string | null;
  buildTrack: boolean;
  pct: number;
  markets: MarketTrack[];
}

export interface GateTrackRow {
  /** Six cells in GATE_KEYS order, or null when the project's gates don't map to the columns. */
  gates: GateMap | null;
  /** Where the shown track is: "BRD" · "Build / MVP1" · … · "Production", the template's own
   * current gate name off the build track, or "No gates set". */
  stage: string;
  /** The project's progress % — one number everywhere (UX plan T3), even when a market's cells are shown. */
  pct: number;
  /** Project-level % (differs from `pct` when a market is shown). */
  projectPct: number;
  /** The market shown, or null for the project's own track. */
  market: { code: string; name: string } | null;
  marketCount: number;
}

/** Stage of a build-track gate row: the first gate not Done, or Production when all are. */
export function stageOfGates(gates: GateMap): string {
  const open = GATE_KEYS.find((k) => gates[k] !== "done");
  return stageOf({ currentGate: open ? GATE_VIEW_LABELS[open] : "Complete", buildTrack: true }).stage;
}

export function gateTrackRow(p: GateSource): GateTrackRow {
  const base = { projectPct: p.pct, marketCount: p.markets.length };
  // Off the build track (another template, or none) the columns don't exist for the project:
  // cells read "—" and Stage is its own current gate by name.
  if (!p.buildTrack) return { ...base, gates: null, stage: stageOf(p).stage, pct: p.pct, market: null };
  const m = furthestBehindMarket(p.markets);
  // One progress % everywhere (UX plan T3): the project's own %, even when the cells show a market.
  if (m) return { ...base, gates: m.gates, stage: stageOfGates(m.gates), pct: p.pct, market: { code: m.code, name: m.name } };
  return { ...base, gates: p.gates, stage: stageOf(p).stage, pct: p.pct, market: null };
}

// ── Filters ────────────────────────────────────────────────────────────────────

export interface GateViewRow {
  id: string;
  code: string;
  name: string;
  priority: string;
  pm: string | null;
  health: HealthBucket;
  track: GateTrackRow;
}

export const GATE_FILTER_KEYS = ["pm", "priority", "stage", "health"] as const;
export type GateFilterKey = (typeof GATE_FILTER_KEYS)[number];
export type GateFilters = Record<GateFilterKey, string>;
/** URL value for "no PM" / "no priority". */
export const NONE = "__none";

/** Lifecycle order for the Stage filter; other templates' gate names follow A–Z, then none. */
const STAGE_ORDER = ["BRD", "Prototype", "Build / MVP1", "SIT", "UAT", "Go-Live", "Production"];
const NO_GATES = "No gates set";

export function stageOptions(stages: string[]): string[] {
  const rank = (s: string) => (s === NO_GATES ? 2 : STAGE_ORDER.includes(s) ? 0 : 1);
  return [...new Set(stages)].sort(
    (a, b) => rank(a) - rank(b) || STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b) || a.localeCompare(b),
  );
}

const eq = (value: string | null, filter: string) => !filter || (value ?? NONE) === filter;

/** Search (project, code, PM) + PM · Priority · Stage · Health, sorted worst health first. */
export function filterGateRows(rows: GateViewRow[], q: string, f: GateFilters): GateViewRow[] {
  return rows
    .filter(
      (r) =>
        matchesSearch(q, r.name, r.code, r.pm) &&
        eq(r.pm, f.pm) &&
        eq(r.priority, f.priority) &&
        eq(r.track.stage, f.stage) &&
        eq(r.health, f.health),
    )
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.name.localeCompare(b.name));
}
