import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Edit Project — field rules shared by the dialog and PATCH /api/projects/:id
 * (`UpdateProjectInput` in src/server/projects.ts). Client-safe.
 */
export const projectName = z.string().trim().min(1, formMessages.enter("a project name")).max(200, formMessages.maxLength("the name", 200));
export const END_BEFORE_START = "The end date must be on or after the start date.";

/** `YYYY-MM-DD` (or ISO) strings; both set and end earlier than start is the one bad case. */
export function endBeforeStart(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  const s = Date.parse(start);
  const e = Date.parse(end);
  return Number.isFinite(s) && Number.isFinite(e) && e < s;
}

export const EditProjectFormSchema = z
  .object({ name: projectName, startDate: z.string(), dueDate: z.string() })
  .superRefine((v, ctx) => {
    if (endBeforeStart(v.startDate, v.dueDate)) ctx.addIssue({ code: "custom", path: ["dueDate"], message: END_BEFORE_START });
  });
