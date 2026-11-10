import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getDailyBrief } from "@/server/daily-brief";
import { getPortfolioHomeExtras } from "@/server/portfolio-home";
import { approvedPortfolio } from "@/lib/portfolio-home";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { PortfolioHome } from "./portfolio-home";

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
  const [{ brief, timeZone }, extras] = await Promise.all([getDailyBrief(ctx, "Executive", cockpit.projects, now), getPortfolioHomeExtras(ctx, ids, now)]);
  return (
    <PortfolioHome
      projects={cockpit.projects}
      extras={extras}
      timeZone={timeZone}
      nowIso={now.toISOString()}
      brief={<DailyBrief key="daily-brief" items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />}
    />
  );
}
