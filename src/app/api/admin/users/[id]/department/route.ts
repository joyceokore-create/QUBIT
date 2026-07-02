import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { updateUserDepartment, UpdateUserDepartmentInput, UserAdminError } from "@/server/users";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateUserDepartmentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
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
