import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { canManageDepartment } from "@/lib/access";
import { updateUserDepartment, UpdateUserDepartmentInput, UserAdminError } from "@/server/users";

// PROMPT §5: heads manage membership of THEIR OWN department only; SuperAdmin any. A head may
// place a user into a department they manage; clearing a department (unassign) is SuperAdmin-only.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateUserDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }

  const targetDept = parsed.data.departmentId;
  const allowed = targetDept
    ? await canManageDepartment(guard.ctx, targetDept)
    : guard.ctx.roles.includes("PlatformSuperAdmin");
  if (!allowed) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You can only manage membership of your own department." } },
      { status: 403 },
    );
  }

  try {
    await updateUserDepartment(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
