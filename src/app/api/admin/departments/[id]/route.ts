import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { canManageDepartment } from "@/lib/access";
import {
  updateDepartment,
  deleteDepartment,
  UpdateDepartmentInput,
  DepartmentAdminError,
} from "@/server/departments";

// PROMPT §5: SuperAdmin manages any department; a head manages ONLY their own. Enforced
// server-side per action via canManageDepartment (SuperAdmin any, head = their headUserId dept).
function forbidden() {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message: "You can only manage your own department." } },
    { status: 403 },
  );
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canManageDepartment(guard.ctx, id))) return forbidden();

  const parsed = UpdateDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }

  try {
    await updateDepartment(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DepartmentAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canManageDepartment(guard.ctx, id))) return forbidden();

  try {
    await deleteDepartment(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DepartmentAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
