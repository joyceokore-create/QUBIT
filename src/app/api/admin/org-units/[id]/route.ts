import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { OrgUnitError, UpdateOrgUnitInput, updateOrgUnit } from "@/server/org-units";

// docs/38 — PATCH /api/admin/org-units/:id { name?, flag?, kind? } (admin:access)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const parsed = UpdateOrgUnitInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await updateOrgUnit(guard.ctx, id, parsed.data) });
  } catch (e) {
    if (e instanceof OrgUnitError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "CODE_TAKEN" ? 409 : 404 });
    throw e;
  }
}
