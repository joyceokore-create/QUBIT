import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { InviteError, resendInvite } from "@/server/invites";

// POST /api/admin/users/:id/resend — mint a fresh invite link and email it (docs/22 §6).
// The previous unconsumed token is invalidated by mintInvite, so "resend" narrows the
// window rather than widening it. Gated on users:invite (Super Admin + heads).
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    const { emailed, acceptUrl } = await resendInvite(guard.ctx, id);
    // The link comes back only when email isn't configured — otherwise it stays in the inbox.
    return NextResponse.json({ emailed, ...(emailed ? {} : { acceptUrl }) });
  } catch (e) {
    if (e instanceof InviteError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
