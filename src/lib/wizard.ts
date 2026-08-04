// M-P1b (docs/26 §5) — pure step navigation for the creation wizards. A step can be
// conditionally skipped (e.g. Markets on a Pipeline portfolio); navigation must hop over
// skipped steps in BOTH directions, and a step that becomes skipped while current must
// resolve to the nearest visible one.

export interface WizardStep {
  key: string;
  label: string;
}

/** Index of the next non-skipped step after `current`, or `current` if none. */
export function nextStep(steps: WizardStep[], current: number, skipped: Set<string>): number {
  for (let i = current + 1; i < steps.length; i++) {
    if (!skipped.has(steps[i].key)) return i;
  }
  return current;
}

/** Index of the previous non-skipped step before `current`, or `current` if none. */
export function prevStep(steps: WizardStep[], current: number, skipped: Set<string>): number {
  for (let i = current - 1; i >= 0; i--) {
    if (!skipped.has(steps[i].key)) return i;
  }
  return current;
}

/** If `current` itself is skipped (a choice changed under it), settle on the nearest
 * visible step — backwards first, so the user re-reads what led here, then forwards. */
export function settleStep(steps: WizardStep[], current: number, skipped: Set<string>): number {
  if (!skipped.has(steps[current]?.key)) return current;
  const back = prevStep(steps, current, skipped);
  if (back !== current) return back;
  return nextStep(steps, current, skipped);
}

/** localStorage key for a wizard draft — per user, so shared machines don't leak drafts. */
export function draftKey(kind: string, userId: string): string {
  return `qubit.wiz.${kind}.${userId}`;
}
