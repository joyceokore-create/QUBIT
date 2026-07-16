import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { listIntegrations } from "@/server/integrations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canViewProject(ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  return NextResponse.json({ data: await listIntegrations(ctx, id) });
}
