import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { InviteError, startPasswordReset } from "@/server/invites";

// POST /api/admin/users/:id/reset-password — admin-initiated reset for an existing
// account (docs/22 §6). Same token mechanism as an invite: the admin never sees or sets
// the password, they just cause a one-time link to be issued.
//
// Gated on users:reset — stricter than users:invite on purpose: inviting a NEW person is
// a delegated act, resetting an EXISTING person's credentials is an account takeover if
// misused, so it stays with Super Admin.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("users:reset");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    const { emailed, acceptUrl } = await startPasswordReset(guard.ctx, id);
    return NextResponse.json({ emailed, ...(emailed ? {} : { acceptUrl }) });
  } catch (e) {
    if (e instanceof InviteError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
