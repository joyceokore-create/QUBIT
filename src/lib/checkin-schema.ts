import { z } from "zod";
import { formMessages } from "@/lib/form-messages";
import { reasonField, reasonMessage } from "@/lib/reason-schema";

/** Weekly check-in ("This week" card) — field rules shared by the card and /api/projects/:id/checkin. Client-safe. */
export const CHECKIN_NARRATIVE_MAX = 500;
export const CHECKIN_REASON_MIN = 5;
export const checkInNarrative = z.string().trim().min(1, "Enter the line for the Head.").max(CHECKIN_NARRATIVE_MAX, formMessages.maxLength("the line", CHECKIN_NARRATIVE_MAX));
export const checkInOverrideReason = reasonField(CHECKIN_REASON_MIN, 300);
export const CHECKIN_REASON_REQUIRED = reasonMessage(CHECKIN_REASON_MIN);

/** The card's own checks: the line is always required; the reason only when the status is changed. */
export const checkInFormSchema = (overridden: boolean) =>
  z.object({ narrative: checkInNarrative, overrideReason: overridden ? checkInOverrideReason : z.string() });
