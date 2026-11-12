import { z } from "zod";

/** The 6-digit authenticator code, shared by the MFA enrolment forms and /api/auth/mfa/verify. Client-safe. */
export const mfaCode = z
  .string()
  .min(1, "Enter the 6-digit code from your authenticator app.")
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");

export const MfaCodeFormSchema = z.object({ token: mfaCode });
