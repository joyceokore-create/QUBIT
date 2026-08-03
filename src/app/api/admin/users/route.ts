import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createUser, CreateUserInput, UserAdminError } from "@/server/users";

export async function POST(req: Request) {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;

  const parsed = CreateUserInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const { user, emailed, acceptUrl } = await createUser(guard.ctx, parsed.data);
    // acceptUrl is present ONLY when email isn't configured — the admin copies it then.
    return NextResponse.json({ id: user.id, emailed, ...(acceptUrl ? { acceptUrl } : {}) }, { status: 201 });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
