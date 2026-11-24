/**
 * Error-state rule (mwashukes-desk/plans/error-states-plan.md; docs/08 § Errors): errors sit on
 * the field. Client-safe helpers shared by the field-error hook and the API envelope.
 */

/** field name → the one message shown under that field. `_` = not tied to a field. */
export type FieldErrors = Record<string, string>;

export interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/**
 * Zod issues → `{ field: message }`, keeping the FIRST issue per path (the most basic problem,
 * e.g. "required" before "too short"). Nested paths are dot-joined (`team.0.startDate`); the
 * root path becomes `_`. `paths` renames a schema path to the form's field name.
 */
export function fieldErrorsFromIssues(issues: readonly IssueLike[], paths?: Record<string, string>): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const raw = issue.path.map(String).join(".") || "_";
    const key = paths?.[raw] ?? raw;
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** The first field (in form order) that has an error, or null. */
export function firstInvalid(order: readonly string[], errors: FieldErrors): string | null {
  return order.find((f) => Boolean(errors[f])) ?? null;
}

/** Read the API's `{ error: { message, fields? } }` envelope safely. */
export function readApiError(payload: unknown, fallback: string): { message: string; fields: FieldErrors } {
  const err = (payload as { error?: { message?: unknown; fields?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : fallback;
  const fields: FieldErrors = {};
  if (err?.fields && typeof err.fields === "object") {
    for (const [k, v] of Object.entries(err.fields as Record<string, unknown>)) if (typeof v === "string") fields[k] = v;
  }
  return { message, fields };
}
