import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { roleDescription, roleErrorField, roleName } from "@/lib/role-schema";
import { RolePermissionError, setCustomRoleStatus, updateCustomRole } from "@/server/role-permissions";

const Body = z
  .object({
    name: roleName.optional(),
    description: roleDescription.nullable().optional(),
    status: z.enum(["Active", "Deactivated"]).optional(),
    reason: z.string().max(500, "The reason must be 500 characters or fewer.").optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined || b.status !== undefined, {
    message: "Nothing to update.",
  });

// Rename / re-describe / (de)activate a custom role. PlatformSuperAdmin-only (roles:manage).
// Deactivation keeps rows and assignments but the role resolves to zero permissions on each
// holder's next sign-in; reactivation restores the saved set.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("roles:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { name, description, status, reason } = parsed.data;

  try {
    if (name !== undefined || description !== undefined) {
      await updateCustomRole(guard.ctx, id, { name, description });
    }
    if (status !== undefined) {
      await setCustomRoleStatus(guard.ctx, id, status, reason);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RolePermissionError) {
      const field = roleErrorField(e.code, e.message);
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: 400 });
    }
    throw e;
  }
}
