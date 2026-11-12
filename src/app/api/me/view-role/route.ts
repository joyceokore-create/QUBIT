import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { ViewRoleInput } from "@/lib/view-roles";
import { setViewRole, ViewRoleError } from "@/server/preferences";

// /api/me/view-role — "Viewing as" / "Preview home as…" (UX plan D2a). POST { role } stores
// the caller's choice when it's one they may view as (403 otherwise). Presentation only:
// permissions are untouched. Audited as view_switch.
export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = ViewRoleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "role is not a QUBIT role." } }, { status: 400 });
  try {
    return NextResponse.json({ data: { role: await setViewRole(guard.ctx, parsed.data.role) } });
  } catch (e) {
    if (e instanceof ViewRoleError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 403 });
    throw e;
  }
}
