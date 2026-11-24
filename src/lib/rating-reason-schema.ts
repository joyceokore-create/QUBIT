import { z } from "zod";
import { reasonField } from "@/lib/reason-schema";

/** Weekly update: why the PM's rating differs from QUBIT's. Client-safe (the minimum mirrors
 * RATING_REASON_MIN in status-workspace-model.ts). */
export const ratingReasonField = reasonField(5, 300);
export const RatingReasonFormSchema = z.object({ ratingReason: ratingReasonField });
