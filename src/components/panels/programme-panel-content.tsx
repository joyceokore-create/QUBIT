import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/dashboard/status-pill";
import { cn } from "@/lib/utils";
import { StatTile, statusTextClass, statusBarClass } from "@/components/panels/panel-primitives";

export interface ProgrammePanelJson {
  id: string;
  name: string;
  description: string | null;
  status: string;
  budget: string | null;
  avgProgress: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  projects: {
    id: string;
    code: string;
    name: string;
    priority: string;
    status: string;
    avgProgress: number;
    orgUnits: { code: string; flag: string | null }[];
  }[];
}

interface ProgrammePanelContentProps {
  data: ProgrammePanelJson;
  onProjectClick: (id: string) => void;
}

export function ProgrammePanelContent({ data, onProjectClick }: ProgrammePanelContentProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="sticky top-0 z-10 gap-0.5 border-b border-background bg-white p-[22px_26px_18px]">
        <div className="mb-[3px] text-[10px] font-semibold tracking-[1px] text-brand uppercase">
          Programme
        </div>
        <SheetTitle className="font-heading text-lg font-bold tracking-[-0.3px] text-foreground">
          {data.name}
        </SheetTitle>
        <p className="mt-0.5 text-[11px] text-ink-3">
          {data.description ? `${data.description} · ` : ""}
          Budget: {data.budget ?? "—"} · {data.projects.length} project
          {data.projects.length === 1 ? "" : "s"}
        </p>
      </SheetHeader>

      <div className="flex flex-col gap-[22px] p-[22px_26px]">
        <div className="grid grid-cols-4 gap-2.5">
          <StatTile
            label="Avg Progress"
            value={`${data.avgProgress}%`}
            valueClassName={statusTextClass(data.status)}
          />
          <StatTile label="Status" value={<StatusPill status={data.status} />} />
          <StatTile label="Projects" value={data.projects.length} />
          <StatTile label="Budget" value={data.budget ?? "—"} valueClassName="text-[15px]" />
        </div>

        <div>
          <div className="mb-2.5 text-[13px] font-semibold text-foreground">RAG Summary</div>
          <div className="flex gap-3">
            <StatTile label="On Track" value={data.onTrack} valueClassName="text-status-green" />
            <StatTile label="At Risk" value={data.atRisk} valueClassName="text-amber" />
            <StatTile label="Overdue" value={data.overdue} valueClassName="text-status-red" />
          </div>
        </div>

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-foreground">Projects in this Programme</div>
            <div className="text-[11px] text-ink-3">Click a project to drill in</div>
          </div>
          <div className="flex flex-col gap-[7px]">
            {data.projects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => onProjectClick(proj.id)}
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
                        className="rounded-[3px] border border-ink-4 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-ink-2"
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
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
