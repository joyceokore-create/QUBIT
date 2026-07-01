import { Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { HealthHeatmap } from "@/components/dashboard/health-heatmap";
import { PortfolioCardGrid } from "@/components/dashboard/portfolio-card";
import { StandaloneCardGrid } from "@/components/dashboard/standalone-card";
import { EscalationsFeed, MilestonesFeed } from "@/components/dashboard/feeds";
import { RefreshButton } from "./refresh-button";
import {
  getDashboardSummary,
  getEscalations,
  getHeatmap,
  getPortfolioCards,
  getStandaloneCards,
  getUpcomingMilestones,
} from "@/server/dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };

  if (!can(ctx, "dashboard:read")) {
    return <Forbidden />;
  }

  const [summary, heatmap, portfolios, standalone, escalations, milestones] = await Promise.all([
    getDashboardSummary(ctx),
    getHeatmap(ctx),
    getPortfolioCards(ctx),
    getStandaloneCards(ctx),
    getEscalations(ctx),
    getUpcomingMilestones(ctx),
  ]);

  const now = new Date();
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-[3px] text-[10px] font-semibold tracking-[1px] text-brand uppercase">
            Executive Overview
          </div>
          <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
            {session.user.tenantName} — Project &amp; Programme Portfolio
          </h1>
          <p className="mt-[3px] text-xs text-ink-3">
            {summary.portfolioCount} portfolios · {standalone.length} standalone items ·{" "}
            {heatmap.orgUnits.length} subsidiaries · {quarter}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Coming later">
            <Download /> Export PPT
          </Button>
          <RefreshButton />
        </div>
      </div>

      <KpiStrip summary={summary} />
      <HealthHeatmap data={heatmap} />

      <div>
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-foreground">Portfolios</div>
          <div className="text-[11px] text-ink-3">Click to explore projects &amp; programmes inside</div>
        </div>
        <PortfolioCardGrid items={portfolios} />
      </div>

      <div>
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-foreground">
            Standalone — Independent Projects &amp; Programmes
          </div>
          <div className="text-[11px] text-ink-3">Not attached to a portfolio</div>
        </div>
        <StandaloneCardGrid items={standalone} />
      </div>

      <div className="grid grid-cols-[1fr_370px] gap-[18px]">
        <EscalationsFeed items={escalations} />
        <MilestonesFeed items={milestones} />
      </div>
    </div>
  );
}
