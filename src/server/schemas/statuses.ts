import { z } from "zod";
import { cuid } from "@/server/schemas/common";

/** Status group creation (04-module-specs §3). Template or explicit statuses. */
export const createStatusGroup = z
  .object({
    name: z.string().min(1).max(120),
    spaceId: cuid.optional(),
    template: z.enum(["simple", "kanban", "scrum", "ppm"]).optional(),
    statuses: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          colorToken: z.string().min(1).max(64),
          type: z.enum(["OPEN", "ACTIVE", "DONE", "CLOSED"]),
        }),
      )
      .min(1)
      .optional(),
  })
  .strict();

export type CreateStatusGroupInput = z.infer<typeof createStatusGroup>;
