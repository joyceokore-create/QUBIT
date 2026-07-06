import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { materialiseRisk, MaterialiseRiskInput, RiskError } from "@/server/risks";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("risk:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  let body: unknown = {};
  const text = await req.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "Invalid input." } },
        { status: 400 },
      );
    }
  }

  const parsed = MaterialiseRiskInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const result = await materialiseRisk(guard.ctx, id, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RiskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
