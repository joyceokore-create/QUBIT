import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { getDeliveryCatalog } from "@/server/status-report-upload";

// GET /api/reports/status-upload/catalog?project=<id> — one project's delivery catalog
// (markets, modules, gates and their current states) so the review dialog can re-resolve
// a slide against a project the PM picked by hand. Read-only; the PM must run the project.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const projectId = new URL(req.url).searchParams.get("project") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick a project." } }, { status: 400 });
  if (!(await canWriteProject(guard.ctx, projectId))) return NextResponse.json({ error: { code: "NOT_FOUND", message: "You don't run this project." } }, { status: 404 });
  const catalog = await getDeliveryCatalog(guard.ctx, projectId);
  if (!catalog) return NextResponse.json({ error: { code: "NOT_FOUND", message: "No such project." } }, { status: 404 });
  return NextResponse.json({ data: catalog });
}
