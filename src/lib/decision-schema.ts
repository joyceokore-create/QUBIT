import { z } from "zod";
import { formMessages } from "@/lib/form-messages";
import { reasonMessage } from "@/lib/reason-schema";

/**
 * Decisions — field rules and copy shared by the Raise / Record / New Action drawers and the
 * /api/decisions routes (src/lib/decisions.ts re-uses them for the wire inputs). Client-safe.
 */
export const decisionTitle = z.string().trim().min(1, formMessages.enter("a title")).min(3, formMessages.minLength("the title", 3)).max(160, formMessages.maxLength("the title", 160));
export const actionTitle = z.string().trim().min(1, formMessages.enter("a title")).min(3, formMessages.minLength("the title", 3)).max(200, formMessages.maxLength("the title", 200));
export const DECISION_NOTE_MIN = 3;
export const decisionNoteMessage = reasonMessage(DECISION_NOTE_MIN);
export const decisionNote = z.string().trim().min(1, decisionNoteMessage).min(DECISION_NOTE_MIN, decisionNoteMessage).max(2000, formMessages.maxLength("the note", 2000));
export const DEFER_DATE_REQUIRED = "Choose the new due date.";
export const DEFER_AFTER_TODAY = "Choose a date after today.";
export const PROJECT_REQUIRED = formMessages.choose("a project");

/** Raise a Decision: a title, and a project unless the raiser is a Head (Group level is allowed). */
export const raiseFormSchema = (headLevel: boolean) =>
  z.object({ title: decisionTitle, projectId: headLevel ? z.string() : z.string().min(1, PROJECT_REQUIRED) });

/** Record a Decision: decline and defer need a reason; defer also needs a new due date after today. */
export const decideFormSchema = (mode: "approve" | "decline" | "defer", todayKey: string) =>
  z
    .object({ note: z.string(), newDue: z.string() })
    .superRefine((v, ctx) => {
      if (mode !== "approve") {
        const r = decisionNote.safeParse(v.note);
        if (!r.success) ctx.addIssue({ code: "custom", path: ["note"], message: r.error.issues[0].message });
      }
      if (mode === "defer") {
        if (!v.newDue) ctx.addIssue({ code: "custom", path: ["newDue"], message: DEFER_DATE_REQUIRED });
        else if (v.newDue <= todayKey) ctx.addIssue({ code: "custom", path: ["newDue"], message: DEFER_AFTER_TODAY });
      }
    });

export const NewActionFormSchema = z.object({ title: actionTitle });
