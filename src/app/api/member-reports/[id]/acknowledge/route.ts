import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { acknowledgeReport, AcknowledgeInput, MemberReportError } from "@/server/member-reports";

// POST /api/member-reports/:id/acknowledge — a project lead signs off THEIR section of a
// member's report (docs/18 §5.1.4). The resource gate lives in acknowledgeReport: only a
// lead/PM of the named project, and only for a section that report actually carries.

const STATUS: Record<MemberReportError["code"], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_SUBMITTED: 409,
  EMPTY: 409,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = AcknowledgeInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    await acknowledgeReport(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MemberReportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    throw e;
  }
}
