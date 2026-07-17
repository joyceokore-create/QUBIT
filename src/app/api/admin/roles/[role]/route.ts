import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { setRolePermissions, RolePermissionError } from "@/server/role-permissions";

const Body = z.object({ permissions: z.array(z.string().min(1)).max(200) });

// Replace a role's permission set for the caller's tenant (Phase 1.5). PlatformSuperAdmin-only
// (roles:manage). The change applies on each affected user's next sign-in.
export async function PATCH(req: Request, { params }: { params: Promise<{ role: string }> }) {
  const guard = await requirePermission("roles:manage");
  if ("response" in guard) return guard.response;
  const { role } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }

  try {
    await setRolePermissions(guard.ctx, decodeURIComponent(role), parsed.data.permissions);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RolePermissionError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
