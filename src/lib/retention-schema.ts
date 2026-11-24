import { z } from "zod";
import { formMessages } from "@/lib/form-messages";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@/lib/retention";

/**
 * Settings › Access Requests — how many days decided requests are kept. Shared by the form
 * (field errors) and the route / server (`RetentionInput` in src/server/platform-settings.ts),
 * so both say the same thing. Client-safe.
 */
const RANGE = formMessages.range("a number of days", RETENTION_MIN_DAYS, RETENTION_MAX_DAYS);
const WHOLE = "Enter a whole number of days.";

/** The number the server receives. */
export const retentionDaysNumber = z
  .number({ message: WHOLE })
  .int(WHOLE)
  .min(RETENTION_MIN_DAYS, RANGE)
  .max(RETENTION_MAX_DAYS, RANGE);

export const RetentionBodySchema = z.object({ days: retentionDaysNumber });

/** What the form checks: the text in the box (empty, decimals and out-of-range each get their own message). */
export const RetentionFormSchema = z.object({
  days: z
    .string()
    .trim()
    .min(1, formMessages.enter("a number of days"))
    .transform((v) => Number(v))
    .pipe(retentionDaysNumber),
});
