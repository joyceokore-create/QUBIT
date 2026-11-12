import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * A required free-text reason (return / exception / decline / park / rating change). The message
 * restates the limit so the field error can replace the hint (docs/08 § Errors). Client-safe.
 */
export const reasonMessage = (min: number) => `Enter a reason of at least ${min} characters.`;

export function reasonField(min: number, max: number) {
  return z.string().trim().min(1, reasonMessage(min)).min(min, reasonMessage(min)).max(max, formMessages.maxLength("the reason", max));
}
