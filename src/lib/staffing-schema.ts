import { z } from "zod";
import { formMessages as m } from "@/lib/form-messages";
import { reasonField } from "@/lib/reason-schema";

/**
 * Resource requests (/staffing) — field rules shared by the Raise form, the Decline reason and
 * the API (`RaiseRequestInput`, the resolve route). Client-safe.
 */
export const STAFFING_NOTE_MAX = 300;
export const DECLINE_REASON_MIN = 3;

export const staffingProject = z.string().min(1, m.choose("a project"));
export const staffingNote = z.string().trim().max(STAFFING_NOTE_MAX, m.maxLength("the reason", STAFFING_NOTE_MAX));
export const staffingAllocation = z.number({ message: m.range("an allocation", 1, 100) }).int(m.range("an allocation", 1, 100)).min(1, m.range("an allocation", 1, 100)).max(100, m.range("an allocation", 1, 100));
export const WINDOW_END_BEFORE_START = "The end date must be on or after the start date.";
export const declineReason = reasonField(DECLINE_REASON_MIN, STAFFING_NOTE_MAX);

/** The Raise form's own checks (dates are `YYYY-MM-DD` from the date inputs). Field names match the API. */
export const RaiseRequestFormSchema = z
  .object({
    projectId: staffingProject,
    windowStart: z.string().min(1, m.enter("a start date")),
    windowEnd: z.string().min(1, m.enter("an end date")),
    note: staffingNote,
  })
  .superRefine((v, ctx) => {
    if (v.windowStart && v.windowEnd && v.windowEnd < v.windowStart) ctx.addIssue({ code: "custom", path: ["windowEnd"], message: WINDOW_END_BEFORE_START });
  });

export const DeclineFormSchema = z.object({ reason: declineReason });
