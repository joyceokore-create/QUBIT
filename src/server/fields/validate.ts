import { z } from "zod";
import type { FieldType } from "@prisma/client";
import { UnprocessableError } from "@/server/errors";

/**
 * Per-type value validation for custom fields (04-module-specs §3). Each FieldType
 * maps to a Zod schema shaped by the field's `config`. Computed types (FORMULA,
 * PROGRESS_AUTO, AI) are read-only — the server derives them, clients can't set them.
 */

export type FieldConfig = {
  options?: { id: string; label: string; color?: string }[];
  max?: number; // RATING
  currency?: string; // MONEY
  formula?: string; // FORMULA
  prompt?: string; // AI
};

export const COMPUTED_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "FORMULA",
  "PROGRESS_AUTO",
  "AI",
]);

export function isComputedType(type: FieldType): boolean {
  return COMPUTED_TYPES.has(type);
}

function schemaFor(type: FieldType, config: FieldConfig): z.ZodTypeAny {
  switch (type) {
    case "TEXT":
    case "LONG_TEXT":
      return z.string().max(type === "TEXT" ? 1000 : 20000);
    case "URL":
      return z.string().url();
    case "EMAIL":
      return z.string().email();
    case "PHONE":
      return z.string().min(3).max(40);
    case "NUMBER":
    case "MONEY":
      return z.number().finite();
    case "DATE":
      return z.string().datetime({ offset: true });
    case "CHECKBOX":
      return z.boolean();
    case "PROGRESS_MANUAL":
      return z.number().int().min(0).max(100);
    case "RATING":
      return z.number().int().min(0).max(config.max ?? 5);
    case "DROPDOWN": {
      const ids = (config.options ?? []).map((o) => o.id);
      return z.string().refine((v) => ids.includes(v), "Value is not a valid option.");
    }
    case "LABELS": {
      const ids = (config.options ?? []).map((o) => o.id);
      return z.array(z.string().refine((v) => ids.includes(v), "Unknown option.")).max(50);
    }
    case "PEOPLE":
    case "RELATIONSHIP":
    case "FILES":
      return z.array(z.string()).max(100); // ids validated for existence at a higher layer
    default:
      // Computed types never reach here (guarded before calling).
      return z.never();
  }
}

/**
 * Validate + normalize a value for a settable field. Throws UnprocessableError (422)
 * for computed types or bad values. `null` clears the value (allowed unless required).
 */
export function validateFieldValue(
  type: FieldType,
  config: FieldConfig,
  value: unknown,
  required = false,
): unknown {
  if (isComputedType(type)) {
    throw new UnprocessableError(`${type} fields are computed and can't be set directly.`);
  }
  if (value === null || value === undefined) {
    if (required) throw new UnprocessableError("This field is required.");
    return null;
  }
  const parsed = schemaFor(type, config).safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableError(parsed.error.issues[0]?.message ?? "Invalid field value.");
  }
  return parsed.data;
}

/** Validate a definition's config at create/update time (e.g. formula syntax, options). */
export function validateFieldConfig(type: FieldType, config: FieldConfig): void {
  if ((type === "DROPDOWN" || type === "LABELS") && (config.options?.length ?? 0) === 0) {
    throw new UnprocessableError(`${type} fields need at least one option.`);
  }
  if (type === "RATING" && config.max !== undefined && (config.max < 1 || config.max > 10)) {
    throw new UnprocessableError("Rating max must be between 1 and 10.");
  }
}
