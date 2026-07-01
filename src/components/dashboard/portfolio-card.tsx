import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortfolioCardData } from "@/server/dashboard";
import { EmptyState } from "@/components/dashboard/empty-state";

function barColor(item: PortfolioCardData) {
  if (item.overdue > 0) return "bg-status-red";
  if (item.atRisk > 0) return "bg-amber";
  return "bg-status-green";
}

function Stat({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn("text-xl leading-none font-bold tracking-[-0.8px]", className)}>
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-[0.6px] text-ink-3 uppercase">{label}</div>
    </div>
  );
}

function PortfolioCard({ item }: { item: PortfolioCardData }) {
  return (
    <Link
      href={`/portfolios/${item.id}`}
      className="group relative block overflow-hidden rounded-[10px] border border-ink-4 bg-white p-[18px_20px] transition-all hover:border-[#a0c9b0] hover:shadow-[var(--shadow)]"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-brand opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="font-heading text-sm font-bold tracking-[-0.2px] text-foreground">
            {item.name}
          </div>
          <div className="mt-0.5 text-[10px] text-ink-3">
            Portfolio · {item.itemCount} items · {item.budget}
          </div>
        </div>
        <span className="text-base text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-brand">
          ›
        </span>
      </div>
      <div className="mb-3 flex gap-4">
        <Stat value={item.onTrack} label="On Track" className="text-status-green" />
        <Stat value={item.atRisk} label="At Risk" className="text-amber" />
        <Stat value={item.overdue} label="Overdue" className="text-status-red" />
        <Stat value={`${item.avgProgress}%`} label="Avg Progress" />
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-background">
        <div
          className={cn("h-full rounded-full", barColor(item))}
          style={{ width: `${item.avgProgress}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {item.orgUnits.map((ou) => (
          <span
            key={ou.code}
            className="rounded-[3px] border border-ink-4 bg-background px-[7px] py-0.5 text-[9px] font-semibold text-ink-2"
          >
            {ou.flag} {ou.code}
          </span>
        ))}
      </div>
    </Link>
  );
}

export function PortfolioCardGrid({ items }: { items: PortfolioCardData[] }) {
  if (items.length === 0) {
    return <EmptyState message="No portfolios yet — create one to start tracking projects." />;
  }
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {items.map((item) => (
        <PortfolioCard key={item.id} item={item} />
      ))}
    </div>
  );
}
