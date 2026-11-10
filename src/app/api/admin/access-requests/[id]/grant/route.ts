import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { grantAccessRequest, GrantAccessInput, AccessRequestError } from "@/server/access-requests";
import { UserAdminError } from "@/server/users";

/**
 * POST /api/admin/access-requests/:id/grant — UX11 Admin home › Review › Grant access.
 * Creates the account through the same engine as POST /api/admin/users (createUser) and then
 * marks the request REVIEWED. Needs `iam:manage` (the request queue) AND `users:invite` (the
 * bar for creating a user). A create failure (e.g. EMAIL_TAKEN) leaves the request waiting.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  if (!can(guard.ctx, "users:invite")) return forbidden();
  const { id } = await params;

  const parsed = GrantAccessInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Choose a role." } }, { status: 400 });
  }

  try {
    const { created } = await grantAccessRequest(guard.ctx, id, parsed.data);
    // Same shape as POST /api/admin/users: acceptUrl only when email isn't configured.
    return NextResponse.json(
      { id: created.user.id, emailed: created.emailed, ...(created.sso ? { sso: true } : {}), ...(created.acceptUrl ? { acceptUrl: created.acceptUrl } : {}) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof AccessRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 409 });
    }
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
