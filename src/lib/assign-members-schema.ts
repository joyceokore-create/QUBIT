import { z } from "zod";
import { END_BEFORE_START, endBeforeStart } from "@/lib/project-schema";

/** Add to Team — field rules shared by the dialog and POST /api/projects/:id/members. Client-safe. */
export const PEOPLE_REQUIRED = "Choose at least one person.";
export const assignedPeople = z.array(z.string().min(1)).min(1, PEOPLE_REQUIRED);

/** The dialog's own checks: someone is picked, and the default window doesn't end before it starts. */
export const AssignMembersFormSchema = z
  .object({ members: assignedPeople, start: z.string(), end: z.string() })
  .superRefine((v, ctx) => {
    if (endBeforeStart(v.start, v.end)) ctx.addIssue({ code: "custom", path: ["end"], message: END_BEFORE_START });
  });
