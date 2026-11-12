import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { ExportRequest } from "@/server/pdf/export";
import { emailReport, ReportEmailError } from "@/server/report-email";

// Milestone D — POST /api/reports/email { template, week?, project?, portfolio? }: render the
// report as a PDF and send it to the roll-up recipients. Head-only (engine-enforced).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<ReportEmailError["code"], number> = {
  FORBIDDEN: 403,
  EMAIL_OFF: 409,
  NO_RECIPIENTS: 409,
  NOT_APPROVED: 409,
  PDF_UNAVAILABLE: 503,
  NOT_FOUND: 404,
};

export async function POST(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const parsed = ExportRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Pass a template, and a project for one-pagers." } }, { status: 400 });
  }
  try {
    const result = await emailReport(guard.ctx, parsed.data);
    return NextResponse.json({ data: { ...result, emailedAt: result.emailedAt.toISOString() } });
  } catch (e) {
    if (e instanceof ReportEmailError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    console.error("[report-email] failed", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "The report could not be emailed." } }, { status: 500 });
  }
}
