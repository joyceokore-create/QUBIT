import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createDepartment, CreateDepartmentInput, DepartmentAdminError } from "@/server/departments";

export async function POST(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;

  const parsed = CreateDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const department = await createDepartment(guard.ctx, parsed.data);
    return NextResponse.json({ id: department.id }, { status: 201 });
  } catch (e) {
    if (e instanceof DepartmentAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
