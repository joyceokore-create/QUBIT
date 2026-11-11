/**
 * UX fidelity D-F3b — how long decided access requests are kept. Client-safe constants:
 * approved and declined requests are deleted this many days after the decision; waiting
 * requests are never deleted automatically. Set by the Super Admin in Settings.
 */
export const RETENTION_DEFAULT_DAYS = 30;
export const RETENTION_MIN_DAYS = 7;
export const RETENTION_MAX_DAYS = 365;

/** A stored value → a usable day count (unset, junk or out of range → the default). */
export function retentionDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(n) && n >= RETENTION_MIN_DAYS && n <= RETENTION_MAX_DAYS ? n : RETENTION_DEFAULT_DAYS;
}

/** Decided before this moment → due for deletion. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
