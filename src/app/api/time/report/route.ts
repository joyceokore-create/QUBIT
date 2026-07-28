import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse, UnprocessableError } from "@/server/errors";
import { timeReport } from "@/server/time";

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
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const header = ["ID", "Task", "Tracked (min)", "Billable (min)"].map(esc).join(",");
      const lines = report.rows.map((r) =>
        [`QBT-${r.taskSeq}`, r.taskName, String(r.totalMin), String(r.billableMin)].map(esc).join(","),
      );
      const csv = [header, ...lines].join("\n");
      return new Response(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="time-report.csv"' },
      });
    }
    return ok(report.rows, { totalMin: report.totalMin });
  } catch (err) {
    return toErrorResponse(err);
  }
}
