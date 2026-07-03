"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/dashboard/status-pill";
import { statusBarClass, statusTextClass, formatDate } from "@/components/panels/panel-primitives";
import { usePanel } from "@/components/panels/panel-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SubsidiaryProjectRow } from "@/server/subsidiaries";

const FILTER_CHIPS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "On Track", value: "OnTrack" },
  { label: "At Risk", value: "AtRisk" },
  { label: "Overdue", value: "Overdue" },
];

interface SubsidiaryProjectTableProps {
  currentOrgUnitCode: string;
  projects: SubsidiaryProjectRow[];
}

export function SubsidiaryProjectTable({ currentOrgUnitCode, projects }: SubsidiaryProjectTableProps) {
  const { openProject } = usePanel();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, statusFilter, query]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-background p-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              size="sm"
              variant={statusFilter === chip.value ? "default" : "outline"}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full max-w-[240px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            placeholder="Search projects…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col">
        {filtered.map((proj) => {
          const overdue = proj.status === "Overdue";
          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => openProject(proj.id)}
              className="flex items-center justify-between gap-3 border-b border-background px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-background"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-foreground">{proj.name}</div>
                <div className="mt-0.5 text-[10px] text-ink-3">
                  {proj.code} · {proj.priority} · {proj.portfolioName ?? "Standalone"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex gap-[3px]">
                  {proj.orgUnits.map((ou) => (
                    <span
                      key={ou.code}
                      className={cn(
                        "rounded-[3px] border px-1.5 py-0.5 text-[9px] font-semibold",
                        ou.code === currentOrgUnitCode
                          ? "border-[#86EFAC] bg-brand-light text-brand"
                          : "border-ink-4 bg-white text-ink-2",
                      )}
                    >
                      {ou.code}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-[60px] overflow-hidden rounded-full bg-background">
                    <div
                      className={cn("h-full rounded-full", statusBarClass(proj.status))}
                      style={{ width: `${proj.progress}%` }}
                    />
                  </div>
                  <span className={cn("min-w-[28px] text-[10px] font-bold", statusTextClass(proj.status))}>
                    {proj.progress}%
                  </span>
                </div>
                <StatusPill status={proj.status} />
                <span className={cn("min-w-[74px] text-[10px]", overdue ? "font-semibold text-status-red" : "text-ink-3")}>
                  {formatDate(proj.dueDate ? proj.dueDate.toISOString() : null)}
                </span>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-ink-3">No projects match this filter.</div>
        )}
      </div>
    </div>
  );
}
