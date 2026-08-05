import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getRollupWeek } from "@/server/portfolio-reports";
import { rollupCsv } from "@/lib/report-csv";

// M-P3c (docs/34 §1) — CSV export of one roll-up week: frozen rows once Approved; the
// Head may export their standing Draft. PDF is deferred with M9-B — stated, not faked.
const WEEK = /^\d{4}-W\d{2}$/;

export async function GET(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const week = new URL(req.url).searchParams.get("week") ?? "";
  if (!WEEK.test(week)) {
    return NextResponse.json({ error: { code: "BAD_WEEK", message: "Pass ?week=YYYY-Www." } }, { status: 400 });
  }
  const view = await getRollupWeek(guard.ctx, week);
  if (!view) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "No roll-up for that week." } }, { status: 404 });
  }
  return new NextResponse(rollupCsv(view.isoWeek, view.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qubit-rollup-${week}.csv"`,
    },
  });
}
