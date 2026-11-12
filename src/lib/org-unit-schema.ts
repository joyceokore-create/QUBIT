import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Admin › Organisation — markets / org units. Field rules shared by the New Market form and
 * the server (`CreateOrgUnitInput` / `UpdateOrgUnitInput` in src/server/org-units.ts). Client-safe.
 */
export const orgUnitCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, formMessages.enter("a code"))
  .regex(/^[A-Z0-9-]{2,12}$/, "Code must be 2–12 letters, digits or dashes.");
export const orgUnitName = z.string().trim().min(1, formMessages.enter("a name")).min(2, formMessages.minLength("the name", 2)).max(80, formMessages.maxLength("the name", 80));
export const orgUnitFlag = z.string().trim().max(8, formMessages.maxLength("the flag", 8)).nullable().optional();
export const orgUnitKind = z.enum(["Market", "Internal"], { message: formMessages.choose("a kind") });

export const NewOrgUnitFormSchema = z.object({ code: orgUnitCode, name: orgUnitName, flag: orgUnitFlag });

/** Server rejections that belong to one field of the New Market form. */
export const ORG_UNIT_ERROR_FIELD: Record<string, string> = {
  CODE_TAKEN: "code",
};
