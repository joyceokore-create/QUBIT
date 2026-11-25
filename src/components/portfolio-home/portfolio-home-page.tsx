import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getDailyBrief } from "@/server/daily-brief";
import { getPortfolioHomeExtras } from "@/server/portfolio-home";
import { getApprovedRollupForWeek } from "@/server/portfolio-reports";
import { isoWeekId, shiftIsoWeek } from "@/lib/iso-week";
import { approvedPortfolio } from "@/lib/portfolio-home";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { PortfolioHome } from "./portfolio-home";
import { HeadSummary } from "./head-summary";

/**
 * UX10 — Executive home ("Portfolio home"), server side. One cockpit load (every project, RLS)
 * shared by the Brief, the KPI cards, the table, the drawer and the side panel; one extra
 * RLS-scoped read for the real blockers needing a decision and the drawer's milestones and
 * confirmed check-in lines.
 */
export async function PortfolioHomePage({ ctx }: { ctx: TenantContext }) {
  const now = new Date();
  const cockpit = await getCockpitData(ctx, now);
  const ids = approvedPortfolio(cockpit.projects).map((p) => p.id);
  const week = isoWeekId(now);
  const [{ brief, timeZone }, extras, signed] = await Promise.all([
    getDailyBrief(ctx, "Executive", cockpit.projects, now),
    getPortfolioHomeExtras(ctx, ids, now),
    // The Head's managerial summary (plan Phase 4): this week's once signed, else last week's.
    getApprovedRollupForWeek(ctx, week).then(async (r) => r ?? getApprovedRollupForWeek(ctx, shiftIsoWeek(week, -1))),
  ]);
  return (
    <PortfolioHome
      projects={cockpit.projects}
      extras={extras}
      timeZone={timeZone}
      nowIso={now.toISOString()}
      brief={
        <>
          <HeadSummary key="head-summary" rollup={signed} isCurrent={signed?.isoWeek === week} />
          <DailyBrief key="daily-brief" items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />
        </>
      }
    />
  );
}
