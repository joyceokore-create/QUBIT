import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse, UnprocessableError } from "@/server/errors";
import { timeReport } from "@/server/time";
import { csvFilename, toCsv } from "@/lib/csv";

// GET /api/time/report?from=&to=&userId=&format=csv — completed entries rolled up per
// task (relocated from /api/v1 in the M0 cull).
export async function GET(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  try {
    const url = new URL(req.url);
    const from = new Date(url.searchParams.get("from") ?? "");
    const to = new Date(url.searchParams.get("to") ?? "");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new UnprocessableError("Valid from/to dates are required.");
    }
    const userId = url.searchParams.get("userId") ?? undefined;
    const report = await timeReport(guard.ctx, { from, to, userId });

    if (url.searchParams.get("format") === "csv") {
      // M9: the shared serializer (BOM, CRLF, quoting, formula-injection guard) replaces
      // the hand-rolled escaping this route grew before the utility existed.
      const csv = toCsv(report.rows, [
        { header: "ID", value: (r) => `QBT-${r.taskSeq}` },
        { header: "Task", value: (r) => r.taskName },
        { header: "Tracked (min)", value: (r) => r.totalMin },
        { header: "Billable (min)", value: (r) => r.billableMin },
      ]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${csvFilename("time-report")}"`,
        },
      });
    }
    return ok(report.rows, { totalMin: report.totalMin });
  } catch (err) {
    return toErrorResponse(err);
  }
}
