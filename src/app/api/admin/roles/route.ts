import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { roleDescription, roleErrorField, roleName } from "@/lib/role-schema";
import { createCustomRole, RolePermissionError } from "@/server/role-permissions";

const Body = z.object({
  name: roleName,
  description: roleDescription.nullable().optional(),
  permissions: z.array(z.string().min(1)).max(200),
});

// Create a custom role (tuma-style permission bundle). PlatformSuperAdmin-only (roles:manage).
export async function POST(req: Request) {
  const guard = await requirePermission("roles:manage");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const id = await createCustomRole(guard.ctx, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    if (e instanceof RolePermissionError) {
      const field = roleErrorField(e.code, e.message);
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: 400 });
    }
    throw e;
  }
}
