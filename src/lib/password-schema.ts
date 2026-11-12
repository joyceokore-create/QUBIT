import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

/**
 * New-password rules shared by the set-password forms (invite accept, first-login onboarding)
 * and their routes, so the browser and the server say the same thing. Client-safe (no bcrypt).
 * Only the length is enforced here; "recently used" is a server-side check and comes back on
 * the `password` field.
 */
export const newPassword = z
  .string()
  .min(1, "Enter a new password.")
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

/** The set-password form: the password, and the same password typed again. */
export const SetPasswordFormSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, "Confirm your password."),
  })
  .superRefine((v, ctx) => {
    if (v.confirm !== "" && v.password !== v.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "Passwords don’t match." });
    }
  });

/** Server rejections of a chosen password: both belong on the password field. */
export const PASSWORD_ERROR_FIELD: Record<string, string> = {
  WEAK_PASSWORD: "password",
  REUSED: "password",
};
