"use client";

import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/dashboard/status-pill";
import { statusBarClass, statusTextClass, formatDate } from "@/components/panels/panel-primitives";
import { usePanel } from "@/components/panels/panel-context";
import type { ProgrammeSummary } from "@/server/projects";

interface ProgrammeCardProps {
  programme: ProgrammeSummary;
  highlightSub?: string;
}

export function ProgrammeCard({ programme, highlightSub }: ProgrammeCardProps) {
  const { openProgramme, openProject } = usePanel();

  return (
    <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white transition-all hover:border-[#a0c9b0] hover:shadow-[var(--shadow)]">
      <button
        type="button"
        onClick={() => openProgramme(programme.id)}
        className="flex w-full items-center justify-between border-b border-background p-[14px_16px] text-left"
      >
        <div>
          <div className="text-[13px] font-semibold text-foreground">{programme.name}</div>
          <div className="mt-px text-[10px] text-ink-3">
            Programme · {programme.budget ?? "—"} · {programme.projectCount} projects
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={programme.status} />
          <div className="flex items-center gap-1.5">
            <div className="h-[5px] w-[80px] overflow-hidden rounded-full bg-background">
              <div
                className={cn("h-full rounded-full", statusBarClass(programme.status))}
                style={{ width: `${programme.avgProgress}%` }}
              />
            </div>
            <span className={cn("text-[11px] font-bold", statusTextClass(programme.status))}>
              {programme.avgProgress}%
            </span>
          </div>
          <span className="text-sm text-ink-4">›</span>
        </div>
      </button>

      <div className="flex flex-col gap-1.5 p-3">
        {programme.projects.map((proj) => (
          <button
            key={proj.id}
            type="button"
            onClick={() => openProject(proj.id)}
            className="flex items-center justify-between rounded-[6px] bg-background px-2.5 py-[7px] text-left transition-colors hover:bg-brand-light"
          >
            <div>
              <div className="text-xs font-medium text-foreground">{proj.name}</div>
              <div className="text-[10px] text-ink-3">
                {proj.code} · {proj.priority}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex gap-[3px]">
                {proj.orgUnits.map((ou) => (
                  <span
                    key={ou.code}
                    className={cn(
                      "rounded-[3px] border px-1.5 py-0.5 text-[9px] font-semibold",
                      ou.code === highlightSub
                        ? "border-[#86EFAC] bg-brand-light text-brand"
                        : "border-ink-4 bg-white text-ink-2",
                    )}
                  >
                    {ou.code}
                  </span>
                ))}
              </div>
              <div className="h-1 w-[60px] overflow-hidden rounded-full bg-white">
                <div
                  className={cn("h-full rounded-full", statusBarClass(proj.status))}
                  style={{ width: `${proj.avgProgress}%` }}
                />
              </div>
              <span className={cn("min-w-[28px] text-[10px] font-bold", statusTextClass(proj.status))}>
                {proj.avgProgress}%
              </span>
              <StatusPill status={proj.status} />
              <span className="text-[10px] text-ink-3">
                {proj.dueDate ? formatDate(proj.dueDate.toISOString()) : "—"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
