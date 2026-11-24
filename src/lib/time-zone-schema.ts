import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { formMessages } from "@/lib/form-messages";

/**
 * Settings › Time Zone — one IANA zone. Shared by the form and POST /api/admin/settings/time-zone.
 * Client-safe (Intl only).
 */
export const timeZoneValue = z
  .string()
  .trim()
  .min(1, formMessages.choose("a time zone"))
  .max(64, formMessages.choose("a time zone from the list"))
  .refine(isValidTimeZone, formMessages.choose("a time zone from the list"));

export const TimeZoneBodySchema = z.object({ timeZone: timeZoneValue });
