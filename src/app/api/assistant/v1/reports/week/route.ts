import { isoWeekId, isoWeekMonday, isValidIsoWeek } from "@/lib/iso-week";
import { getRollupForWeek } from "@/server/portfolio-reports";
import { AssistantError, assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/reports/week[?week] — getWeeklyRollup (plan Phase 5): the same rows the
// Head's roll-up rail shows. Needs reports:read, like /reports.
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "reports:read" }, async (ctx, req) => {
  const now = new Date();
  const week = new URL(req.url).searchParams.get("week") ?? isoWeekId(now);
  if (!isValidIsoWeek(week) || isoWeekMonday(week) > now) throw new AssistantError("Pass a week that has started, like 2026-W48.");
  const v = await getRollupForWeek(ctx, week, now);
  return {
    week: v.isoWeek,
    status: v.status,
    headSummary: v.narrative,
    counts: { ...v.ragCounts, total: v.total, checkInsIn: v.confirmed },
    projects: v.rows.map((r) => ({ code: r.code, name: r.name, pmName: r.pmName, rag: r.rag, checkIn: r.checkIn, narrative: r.narrative })),
  };
});
