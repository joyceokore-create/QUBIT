/**
 * Checkpoint states and the derived-% rule (docs/18 §2), with no server dependencies so
 * client components and the cockpit can share them. `src/server/checkpoints.ts` re-exports
 * these; the maths lives here once.
 */

export const CHECKPOINT_STATES = ["NotStarted", "InProgress", "Done", "Blocked"] as const;
export type CheckpointState = (typeof CHECKPOINT_STATES)[number];

/** Done counts fully, InProgress counts half; Blocked and NotStarted count nothing —
 * a blocked gate is honest about being stuck, not half-credited (§2 "weighted count"). */
const WEIGHT: Record<CheckpointState, number> = { Done: 1, InProgress: 0.5, Blocked: 0, NotStarted: 0 };

/** Derived completion for one track. Pure, so the maths is unit-testable. */
export function derivedProgress(states: CheckpointState[]): number {
  if (states.length === 0) return 0;
  const earned = states.reduce((sum, s) => sum + (WEIGHT[s] ?? 0), 0);
  return Math.round((earned / states.length) * 100);
}
