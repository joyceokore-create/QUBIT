import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createUser, CreateUserInput, UserAdminError } from "@/server/users";

export async function POST(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;

  const parsed = CreateUserInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(guard.ctx, parsed.data);
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
