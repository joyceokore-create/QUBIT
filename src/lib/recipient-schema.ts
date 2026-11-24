import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/** Roll-up recipients — field rules shared by the dialog and /api/rollup/recipients. Client-safe. */
export const recipientEmail = z.string().trim().toLowerCase().min(1, formMessages.enter("an email address")).email(formMessages.email()).max(254, formMessages.maxLength("the email address", 254));
export const recipientUser = z.string().min(1, formMessages.choose("a person"));

/** One schema for the dialog's two small forms; each submit validates only its own field. */
export const RecipientsFormSchema = z.object({ userId: recipientUser, email: recipientEmail });
