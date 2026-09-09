import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { RolePermissionError, setCustomRoleStatus, updateCustomRole } from "@/server/role-permissions";

const Body = z
  .object({
    name: z.string().min(1).max(64).optional(),
    description: z.string().max(500).nullable().optional(),
    status: z.enum(["Active", "Deactivated"]).optional(),
    reason: z.string().max(500).optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
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
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
