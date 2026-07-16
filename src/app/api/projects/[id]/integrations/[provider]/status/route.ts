import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { getIntegrationSummary } from "@/server/connectors";

type Ctx = { params: Promise<{ id: string; provider: string }> };

// Live connector summary for a connected integration (null if unconnected / no token / error).
export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id, provider } = await params;
  if (!(await canViewProject(ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  return NextResponse.json({ summary: await getIntegrationSummary(ctx, id, provider) });
}
