import { z } from "zod";

/** Record Leave — field rules + copy shared by the dialog and POST /api/absences. Client-safe. */
export const ABSENCE_MSG = {
  person: "Choose a person.",
  start: "Enter the first day away.",
  end: "Enter the last day away.",
  order: "The last day away cannot be before the first.",
  note: "The note must be 300 characters or fewer.",
} as const;

/** The dialog's own checks (date inputs give YYYY-MM-DD; the server takes ISO datetimes). */
export const RecordLeaveFormSchema = z
  .object({
    userId: z.string().min(1, ABSENCE_MSG.person),
    startDate: z.string().min(1, ABSENCE_MSG.start),
    endDate: z.string().min(1, ABSENCE_MSG.end),
    note: z.string().max(300, ABSENCE_MSG.note),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && new Date(v.endDate) < new Date(v.startDate)) ctx.addIssue({ code: "custom", path: ["endDate"], message: ABSENCE_MSG.order });
  });
