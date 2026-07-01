import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/server/dashboard";

interface KpiCardProps {
  label: string;
  value: string | number;
  foot: string;
  barPct: number;
  barColorClass: string;
  valueColorClass?: string;
}

function KpiCard({ label, value, foot, barPct, barColorClass, valueColorClass }: KpiCardProps) {
  return (
    <div className="rounded-[10px] border border-ink-4 bg-white p-[15px_17px]">
      <div className="mb-[7px] text-[9px] font-bold tracking-[0.7px] text-ink-3 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "text-[26px] leading-none font-bold tracking-[-1.2px] text-foreground",
          valueColorClass,
        )}
      >
        {value}
      </div>
      <div className="mt-[5px] text-[10px] text-ink-3">{foot}</div>
      <div className="mt-[9px] h-[3px] overflow-hidden rounded-full bg-background">
        <div
          className={cn("h-full rounded-full", barColorClass)}
          style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
        />
      </div>
    </div>
  );
}

export function KpiStrip({ summary }: { summary: DashboardSummary }) {
  const total = summary.totalItems || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="grid grid-cols-6 gap-3">
      <KpiCard
        label="Total Items"
        value={summary.totalItems}
        foot="Projects & Programmes"
        barPct={100}
        barColorClass="bg-brand"
      />
      <KpiCard
        label="Portfolios"
        value={summary.portfolioCount}
        foot="Active portfolios"
        barPct={100}
        barColorClass="bg-brand"
      />
      <KpiCard
        label="On Track"
        value={summary.onTrack}
        foot={`${pct(summary.onTrack)}% of items`}
        barPct={pct(summary.onTrack)}
        barColorClass="bg-status-green"
        valueColorClass="text-status-green"
      />
      <KpiCard
        label="At Risk"
        value={summary.atRisk}
        foot="Needs monitoring"
        barPct={pct(summary.atRisk)}
        barColorClass="bg-amber"
        valueColorClass="text-amber"
      />
      <KpiCard
        label="Overdue"
        value={summary.overdue}
        foot="Escalation needed"
        barPct={pct(summary.overdue)}
        barColorClass="bg-status-red"
        valueColorClass="text-status-red"
      />
      <KpiCard
        label="Total Budget"
        value={summary.totalBudget}
        foot={`Across ${summary.portfolioCount} portfolios`}
        barPct={100}
        barColorClass="bg-brand"
      />
    </div>
  );
}
