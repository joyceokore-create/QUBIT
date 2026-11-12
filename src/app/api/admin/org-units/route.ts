import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { ORG_UNIT_ERROR_FIELD } from "@/lib/org-unit-schema";
import { CreateOrgUnitInput, OrgUnitError, createOrgUnit, listOrgUnits } from "@/server/org-units";

// docs/38 — Admin › Organisation. GET lists org units (anyone who can read projects, so
// pickers work); POST creates one (admin:access).

export async function GET() {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await listOrgUnits(guard.ctx) });
}

export async function POST(req: Request) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const parsed = CreateOrgUnitInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    return NextResponse.json({ data: await createOrgUnit(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof OrgUnitError) {
      const field = ORG_UNIT_ERROR_FIELD[e.code];
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: e.code === "CODE_TAKEN" ? 409 : 404 });
    }
    throw e;
  }
}
