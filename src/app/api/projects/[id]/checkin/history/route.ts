import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { listProjectReports } from "@/server/checkins";

// M-P3a — the workspace Reports tab's history: confirmed check-ins, newest first.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canViewProject(ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  return NextResponse.json({ data: await listProjectReports(ctx, id) });
}
