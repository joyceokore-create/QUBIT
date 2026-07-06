import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listRisks, createRisk, CreateRiskInput, RiskError } from "@/server/risks";

export async function GET(req: Request) {
  const guard = await requirePermission("risk:read");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const items = await listRisks(guard.ctx, {
    status: searchParams.get("status") ?? undefined,
    ownerId: searchParams.get("owner") ?? undefined,
    projectId: searchParams.get("project") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requirePermission("risk:create");
  if ("response" in guard) return guard.response;

  const parsed = CreateRiskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const risk = await createRisk(guard.ctx, parsed.data);
    return NextResponse.json({ id: risk.id, status: risk.status, createdAt: risk.createdAt }, { status: 201 });
  } catch (e) {
    if (e instanceof RiskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
