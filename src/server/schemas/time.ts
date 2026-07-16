import { z } from "zod";
import { cuid } from "@/server/schemas/common";

/** Time-tracking request schemas (05-api-spec.md §Time). */

export const stopTimer = z.object({ entryId: cuid.optional() }).strict();

export const manualEntry = z
  .object({
    durationMin: z.number().int().min(1).max(24 * 60),
    start: z.coerce.date().optional(),
    note: z.string().max(500).optional(),
    billable: z.boolean().optional(),
  })
  .strict();
