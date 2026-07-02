"use client";

import { cn } from "@/lib/utils";
import type { StandaloneCardData } from "@/server/dashboard";
import { StatusPill } from "@/components/dashboard/status-pill";
import { EmptyState } from "@/components/dashboard/empty-state";
import { usePanel } from "@/components/panels/panel-context";

function barColorForStatus(status: string) {
  if (status === "Overdue") return "bg-status-red";
  if (status === "AtRisk") return "bg-amber";
  return "bg-status-green";
}

// Standalone "programmes" (e.g. FIKRA) are still Project rows in the schema (type:
// "Programme", no portfolio/programme link) — there's no separate Programme record for
// them, so every standalone card opens the project panel regardless of its type label.
function StandaloneCard({ item }: { item: StandaloneCardData }) {
  const { openProject } = usePanel();

  return (
    <button
      type="button"
      onClick={() => openProject(item.id)}
      className="relative block w-full rounded-[10px] border border-ink-4 bg-white p-[15px_16px] text-left transition-all hover:border-[#a0c9b0] hover:shadow-[var(--shadow)]"
    >
      <span
        className={cn(
          "mb-2 inline-block rounded-[3px] px-2 py-0.5 text-[9px] font-bold tracking-[0.5px] uppercase",
          item.type === "Programme" ? "bg-status-blue-bg text-status-blue" : "bg-brand-light text-brand",
        )}
      >
        {item.type}
      </span>
      <div className="absolute top-[14px] right-[14px]">
        <StatusPill status={item.status} />
      </div>
      <div className="mb-1 text-[13px] font-semibold text-foreground">{item.name}</div>
      <div className="mb-2.5 text-[10px] text-ink-3">
        {item.code} · {item.priority} Priority · {item.budget}
      </div>
      <div className="mb-2 flex items-center gap-2">
        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-background">
          <div
            className={cn("h-full rounded-full", barColorForStatus(item.status))}
            style={{ width: `${item.avgProgress}%` }}
          />
        </div>
        <div className="min-w-[30px] text-[11px] font-bold">{item.avgProgress}%</div>
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {item.orgUnits.map((ou) => (
          <span
            key={ou.code}
            className="rounded-[3px] border border-ink-4 bg-background px-1.5 py-0.5 text-[9px] font-semibold text-ink-2"
          >
            {ou.code}
          </span>
        ))}
      </div>
    </button>
  );
}

export function StandaloneCardGrid({ items }: { items: StandaloneCardData[] }) {
  if (items.length === 0) {
    return <EmptyState message="No standalone items — projects without a portfolio show up here." />;
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <StandaloneCard key={item.id} item={item} />
      ))}
    </div>
  );
}
