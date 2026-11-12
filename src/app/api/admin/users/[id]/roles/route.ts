import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { INVITE_ERROR_FIELD } from "@/lib/invite-schema";
import { updateUserRoles, UpdateRolesInput, UserAdminError } from "@/server/users";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("users:roles");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateRolesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  try {
    await updateUserRoles(guard.ctx, id, parsed.data.roles);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      const field = INVITE_ERROR_FIELD[e.code]; // BAD_ROLE / FORBIDDEN_GRANT belong to the roles group
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: 400 });
    }
    throw e;
  }
}
