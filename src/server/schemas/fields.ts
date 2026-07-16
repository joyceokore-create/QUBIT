import { z } from "zod";

/** Custom-field request schemas (05-api-spec.md §Statuses & Fields). */

export const fieldType = z.enum([
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "MONEY",
  "DATE",
  "DROPDOWN",
  "LABELS",
  "CHECKBOX",
  "URL",
  "EMAIL",
  "PHONE",
  "PEOPLE",
  "RATING",
  "PROGRESS_AUTO",
  "PROGRESS_MANUAL",
  "FORMULA",
  "RELATIONSHIP",
  "FILES",
  "AI",
]);

export const createFieldDefinition = z
  .object({
    name: z.string().min(1).max(120),
    type: fieldType,
    config: z.record(z.unknown()).optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const updateFieldDefinition = z
  .object({
    name: z.string().min(1).max(120).optional(),
    config: z.record(z.unknown()).optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

// Value can be any JSON shape; the server validates it against the field's type.
export const setFieldValue = z.object({ value: z.unknown() }).strict();

const LOCATION_TYPES = { space: "SPACE", folder: "FOLDER", list: "LIST" } as const;
export function parseLocationType(param: string): "SPACE" | "FOLDER" | "LIST" | null {
  return LOCATION_TYPES[param.toLowerCase() as keyof typeof LOCATION_TYPES] ?? null;
}
