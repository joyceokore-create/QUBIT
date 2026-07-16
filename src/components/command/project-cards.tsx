"use client";

import { usePanel } from "@/components/panels/panel-context";

export interface ProjectCard {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  avgProgress: number;
  dueDate: string | null;
  memberCount: number;
}

const STATUS_TOKEN: Record<string, string> = {
  OnTrack: "--ok",
  AtRisk: "--warn",
  Overdue: "--bad",
  Planning: "--qinfo",
  Completed: "--ok",
  Cancelled: "--ink4",
};
const color = (s: string) => `var(${STATUS_TOKEN[s] ?? "--ink4"})`;

/** Command Center project grid — cards open the project slide panel. */
export function ProjectCards({ projects }: { projects: ProjectCard[] }) {
  const { openProject } = usePanel();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => openProject(p.id)}
          className="q-lift flex flex-col gap-3 rounded-[15px] border border-[var(--w08)] bg-[var(--qcard)] p-[18px] text-left hover:border-[color-mix(in_oklab,var(--brand)_50%,transparent)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-[var(--qink)]">{p.name}</div>
              <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[1px] text-[var(--ink4)]">
                {p.code} · {p.priority}
              </div>
            </div>
            <span
              className="flex-none rounded-full px-2.5 py-1 text-[10.5px] font-bold"
              style={{ color: color(p.status), background: `color-mix(in oklab, ${color(p.status)} 14%, transparent)` }}
            >
              {p.status}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11.5px] text-[var(--ink4)]">
            <span>
              {p.memberCount} {p.memberCount === 1 ? "person" : "people"}
            </span>
            <span>{p.dueDate ? `Due ${new Date(p.dueDate).toLocaleDateString()}` : "No due date"}</span>
          </div>

          <div>
            <div className="h-[5px] overflow-hidden rounded-full bg-[var(--w08)]">
              <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${p.avgProgress}%` }} />
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--ink3)]">
              avg progress · <span className="font-semibold text-[var(--qink)]">{p.avgProgress}%</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
