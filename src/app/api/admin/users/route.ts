import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createUser, CreateUserInput, UserAdminError } from "@/server/users";
import { validationError } from "@/server/errors";
import { INVITE_ERROR_FIELD } from "@/lib/invite-schema";

export async function POST(req: Request) {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;

  const parsed = CreateUserInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { user, emailed, acceptUrl, sso } = await createUser(guard.ctx, parsed.data);
    // sso: the account is usable via Microsoft immediately, no link. Otherwise acceptUrl is
    // present ONLY when email isn't configured — the admin copies it then.
    return NextResponse.json(
      { id: user.id, emailed, ...(sso ? { sso: true } : {}), ...(acceptUrl ? { acceptUrl } : {}) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof UserAdminError) {
      // docs/08 § Errors: a rejection that belongs to one field (e.g. email already in use) is
      // returned against that field so the form can show it there.
      const field = INVITE_ERROR_FIELD[e.code];
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: 400 });
    }
    throw e;
  }
}
