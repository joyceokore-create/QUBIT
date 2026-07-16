/**
 * Fractional ordering (docs/clickup-transformation/03-data-model.md §Conventions).
 * `orderIndex` is a Float; inserting between two siblings uses the midpoint, so a
 * move touches one row instead of renumbering the list. A background job
 * re-normalizes when gaps shrink below EPSILON.
 */

export const ORDER_STEP = 1000;
export const ORDER_EPSILON = 1e-6;

/**
 * Order index for an item placed between `before` and `after` siblings.
 * - both null  → first item (ORDER_STEP)
 * - before only (append) → before + ORDER_STEP
 * - after only (prepend) → after / 2
 * - both       → midpoint
 * Throws if the two bounds are out of order (caller passed a bad neighbour pair).
 */
export function orderIndexBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return ORDER_STEP;
  if (before === null) return after! / 2;
  if (after === null) return before + ORDER_STEP;
  if (before >= after) {
    throw new Error(`orderIndexBetween: bounds out of order (${before} >= ${after}).`);
  }
  return (before + after) / 2;
}

/** True when neighbouring gaps have collapsed enough to warrant a re-normalize pass. */
export function needsRenormalize(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after - before < ORDER_EPSILON;
}
