import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { importAbsenceCsv } from "@/server/connectors/hr-absence";

// POST /api/absences/import — the CSV file bridge (docs/16 §5 adapter mode 2). Body is
// the raw CSV text: `email,type,start,end[,ref]`. Same write gate as manual entry.
// The response reports rejected rows and unknown people rather than failing whole.

export async function POST(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  if (!(can(guard.ctx, "iam:manage") || can(guard.ctx, "project:update"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const text = await req.text();
  if (!text.trim()) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "The file is empty." } }, { status: 400 });
  }
  return NextResponse.json(await importAbsenceCsv(guard.ctx, text));
}
