import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Invite a User — the details step, shared by the form (field errors) and the server
 * (`CreateUserInput` in src/server/users.ts), so both say the same thing. Client-safe.
 * Format only: a well-formed but wrong address passes here; the server and the invite email
 * itself are the real checks.
 */
export const inviteName = z.string().trim().min(1, formMessages.enter("a full name")).max(120, formMessages.maxLength("the name", 120));
export const inviteEmail = z.string().trim().min(1, formMessages.enter("a work email")).email(formMessages.workEmail());

export const InviteDetailsSchema = z.object({ name: inviteName, email: inviteEmail });

/** Server rejections that belong to one field of the invite form. */
export const INVITE_ERROR_FIELD: Record<string, string> = {
  EMAIL_TAKEN: "email",
  BAD_ROLE: "roles",
  FORBIDDEN_GRANT: "roles",
};
