import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteRisk } from "@/lib/access";
import { updateRisk, UpdateRiskInput, RiskError } from "@/server/risks";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("risk:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  if (!(await canWriteRisk(guard.ctx, id))) {
    return forbidden("You can only edit risks on a project you're part of.");
  }

  const parsed = UpdateRiskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    await updateRisk(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RiskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
