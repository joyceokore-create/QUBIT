import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getSubsidiaryDetail } from "@/server/subsidiaries";

export async function GET(req: Request, { params }: { params: Promise<{ orgUnitId: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { orgUnitId } = await params;

  const { searchParams } = new URL(req.url);
  const subsidiary = await getSubsidiaryDetail(guard.ctx, orgUnitId, {
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });

  if (!subsidiary) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Subsidiary not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(subsidiary);
}
