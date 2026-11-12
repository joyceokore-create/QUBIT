import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Custom roles — field rules shared by the New Role / rename / deactivate forms and the routes
 * under src/app/api/admin/roles. Client-safe. (The 2–64 length mirrors `validateCustomRoleName`
 * in src/server/role-permissions.ts, which stays the authority.)
 */
export const roleName = z.string().trim().min(1, formMessages.enter("a role name")).min(2, formMessages.minLength("the name", 2)).max(64, formMessages.maxLength("the name", 64));
export const roleDescription = z.string().trim().max(500, formMessages.maxLength("the description", 500));
export const deactivationReason = z.string().trim().min(1, "Enter a reason of at least 3 characters.").min(3, "Enter a reason of at least 3 characters.").max(500, formMessages.maxLength("the reason", 500));

export const NewRoleFormSchema = z.object({ name: roleName, description: roleDescription });
export const RenameRoleFormSchema = z.object({ name: roleName, description: roleDescription });
export const DeactivateRoleFormSchema = z.object({ reason: deactivationReason });

/** Which field a role-admin rejection belongs to (undefined = form-level, shown in the banner). */
export function roleErrorField(code: string, message: string): "name" | "reason" | undefined {
  if (code !== "BAD_ROLE") return undefined;
  if (/reason/i.test(message)) return "reason";
  if (/unknown role/i.test(message)) return undefined;
  return "name";
}
