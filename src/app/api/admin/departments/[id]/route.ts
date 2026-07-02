import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import {
  updateDepartment,
  deleteDepartment,
  UpdateDepartmentInput,
  DepartmentAdminError,
} from "@/server/departments";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
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
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

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
