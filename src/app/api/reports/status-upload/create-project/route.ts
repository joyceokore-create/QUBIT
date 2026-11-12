import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { createProjectFromReport, getDeliveryCatalog, UploadWeekError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/create-project { name } — a report row for a project
// QUBIT doesn't have yet: create it (uploader = PM, first live gate template) and hand back
// the project with its delivery catalog so the row can land on it.
export const dynamic = "force-dynamic";

const Input = z.object({ name: z.string().trim().min(1).max(160) });

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Give the project a name." } }, { status: 400 });
  try {
    const project = await createProjectFromReport(guard.ctx, parsed.data.name);
    const catalog = await getDeliveryCatalog(guard.ctx, project.id);
    return NextResponse.json({ data: { project, catalog } }, { status: 201 });
  } catch (e) {
    if (e instanceof UploadWeekError) return NextResponse.json({ error: { code: "FORBIDDEN", message: e.message } }, { status: 403 });
    throw e;
  }
}
