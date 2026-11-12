import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { DEPARTMENT_ERROR_FIELD } from "@/lib/department-schema";
import { createDepartment, CreateDepartmentInput, DepartmentAdminError } from "@/server/departments";

export async function POST(req: Request) {
  const guard = await requirePermission("departments:manage");
  if ("response" in guard) return guard.response;

  const parsed = CreateDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const department = await createDepartment(guard.ctx, parsed.data);
    return NextResponse.json({ id: department.id }, { status: 201 });
  } catch (e) {
    if (e instanceof DepartmentAdminError) {
      const field = DEPARTMENT_ERROR_FIELD[e.code];
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: 400 });
    }
    throw e;
  }
}
