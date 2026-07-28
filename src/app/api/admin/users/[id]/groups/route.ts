import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { setUserGroups, SetUserGroupsInput, UserAdminError } from "@/server/users";

// PATCH /api/admin/users/[id]/groups — edit DECLARED dashboard groups (docs/17 §1.3).
// Presentation only, so it shares the invite gate (SuperAdmin + heads), not the
// SuperAdmin-only roles gate — changing a landing page is not changing authority.

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;
  const parsed = SetUserGroupsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid groups." } }, { status: 400 });
  }
  const { id } = await params;
  try {
    await setUserGroups(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    }
    throw e;
  }
}
