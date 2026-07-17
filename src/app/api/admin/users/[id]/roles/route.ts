import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { updateUserRoles, UpdateRolesInput, UserAdminError } from "@/server/users";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("users:roles");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateRolesInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    await updateUserRoles(guard.ctx, id, parsed.data.roles);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
