import { derivedProgress, type CheckpointState } from "@/lib/checkpoint-progress";

// UX1 — the cockpit's gate view of REAL checkpoint states. Pure and client-safe (the
// cockpit's client components read the column constants); the server assembler in
// src/server/dashboard-cockpit.ts feeds it the loaded states.

// The "Product build" template's gates (docs/18 §2) — the cockpit's fixed columns. A project
// on another template (e.g. "Market rollout") still shows its own current gate by name
// (`currentGate`), but its columns read "none" because those gates don't exist for it.
export type GateState = "done" | "prog" | "late" | "block" | "none";
export const GATE_KEYS = ["brd", "proto", "mvp1", "sit", "uat", "golive"] as const;
export type GateKey = (typeof GATE_KEYS)[number];
export const GATE_LABELS: Record<GateKey, string> = { brd: "BRD", proto: "Proto", mvp1: "MVP1", sit: "SIT", uat: "UAT", golive: "Go-Live" };
export type GateMap = Record<GateKey, GateState>;

/** Checkpoint name → cockpit column. Case, spaces and punctuation are ignored. */
const GATE_ALIASES: Record<string, GateKey> = {
  brd: "brd",
  proto: "proto",
  prototype: "proto",
  mvp: "mvp1",
  mvp1: "mvp1",
  sit: "sit",
  uat: "uat",
  golive: "golive",
};
export function gateKeyOf(checkpointName: string): GateKey | null {
  return GATE_ALIASES[checkpointName.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
}

const EMPTY_GATES = (): GateMap => ({ brd: "none", proto: "none", mvp1: "none", sit: "none", uat: "none", golive: "none" });

/** One real checkpoint state → its cockpit cell. In progress past the target date reads late. */
function cellOf(state: CheckpointState, targetPassed: boolean): GateState {
  if (state === "Done") return "done";
  if (state === "Blocked") return "block";
  if (state === "InProgress") return targetPassed ? "late" : "prog";
  return "none";
}

export interface GateTrack {
  gates: GateMap;
  /** Name of the first gate not yet Done; "Complete" when all are; null with no template. */
  currentGate: string | null;
  /** The template's own gates map onto the cockpit columns (the "Product build" shape). */
  buildTrack: boolean;
  /** Derived % from the states (Done 1, InProgress ½), or null with no template. */
  progress: number | null;
}

/**
 * Pure: a track's ordered checkpoints + their stored states → the cockpit's gate view.
 * Checkpoints with no stored state are NotStarted (the template is the denominator).
 */
export function gateTrackOf(
  checkpoints: { id: string; name: string }[],
  stateById: Map<string, CheckpointState>,
  targetPassed: boolean,
): GateTrack {
  if (!checkpoints.length) return { gates: EMPTY_GATES(), currentGate: null, buildTrack: false, progress: null };
  const gates = EMPTY_GATES();
  const states = checkpoints.map((c) => stateById.get(c.id) ?? ("NotStarted" as CheckpointState));
  let mapped = 0;
  checkpoints.forEach((c, i) => {
    const key = gateKeyOf(c.name);
    if (!key) return;
    mapped++;
    gates[key] = cellOf(states[i]!, targetPassed);
  });
  const firstOpen = states.findIndex((s) => s !== "Done");
  return {
    gates,
    currentGate: firstOpen === -1 ? "Complete" : checkpoints[firstOpen]!.name,
    buildTrack: mapped === checkpoints.length,
    progress: derivedProgress(states),
  };
}

const STAGE_OF: Record<GateKey, { phase: string; stage: string }> = {
  brd: { phase: "Planning", stage: "BRD" },
  proto: { phase: "Planning", stage: "Prototype" },
  mvp1: { phase: "Execution", stage: "Build / MVP1" },
  sit: { phase: "Execution", stage: "SIT" },
  uat: { phase: "Execution", stage: "UAT" },
  golive: { phase: "Transition", stage: "Go-Live" },
};
/** Phases in lifecycle order; "Not gated" collects projects with no checkpoint template. */
export const COCKPIT_PHASES = ["Planning", "Execution", "Transition", "Closure", "Not gated"] as const;

/** Where a project is, read from its real gates (one rule for every cockpit preset). */
export function stageOf(p: { currentGate: string | null; buildTrack: boolean }): { phase: string; stage: string } {
  if (p.currentGate === null) return { phase: "Not gated", stage: "No gates set" };
  if (p.currentGate === "Complete") return { phase: "Closure", stage: "Production" };
  const key = gateKeyOf(p.currentGate);
  if (p.buildTrack && key) return STAGE_OF[key];
  return { phase: "Execution", stage: p.currentGate };
}

