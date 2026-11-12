import { z } from "zod";

/** Users › Edit drawer — field rules shared by the drawer and its routes. Client-safe. */
export const userRoles = z.array(z.string().min(1)).min(1, "Choose at least one role.");
export const UserRolesFormSchema = z.object({ roles: userRoles });

/** The step-up code: optional (only needed when the admin has MFA), but 6 digits when given. */
export const mfaResetCode = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");
export const MfaResetFormSchema = z.object({ code: z.union([z.literal(""), mfaResetCode]) });
