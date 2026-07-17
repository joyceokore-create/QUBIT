import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/api-guard";
import { generateReport, QReportError } from "@/server/q/report";
import { canAccessReport } from "@/server/q/access";

const Body = z.object({
  type: z.enum(["project", "resource", "portfolio", "manager", "member"]),
  targetId: z.string().min(1).optional(),
  period: z.enum(["week", "month", "all"]).optional(),
});

// Q copilot report endpoint (MVP1 Phase C, reports centre). Authenticated (dashboard:read),
// then per-type authorised: own reports for everyone, project/portfolio/other-person reports
// require reports:read. Reports are grounded on the caller's tenant data only.
export async function POST(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }
  const { type, targetId, period } = parsed.data;

  if (!(await canAccessReport(guard.ctx, type, targetId))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You don't have permission to run that report." } },
      { status: 403 },
    );
  }

  const session = await auth();
  const tenantName = session?.user?.tenantName ?? "your organization";

  try {
    const result = await generateReport(guard.ctx, { type, targetId, period, tenantName });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof QReportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
