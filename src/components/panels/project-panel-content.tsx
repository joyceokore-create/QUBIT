import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/dashboard/status-pill";
import { cn } from "@/lib/utils";
import {
  StatTile,
  statusTextClass,
  statusBarClass,
  formatDate,
} from "@/components/panels/panel-primitives";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { EditProjectDialog } from "@/components/panels/edit-project-dialog";
import { ProjectResourcesSection } from "@/components/panels/project-resources-section";
import { ProjectTasksSection } from "@/components/panels/project-tasks-section";
import { ProjectBlockersSection } from "@/components/panels/project-blockers-section";
import { AskQAbout } from "@/components/q/ask-q-about";

export interface ProjectPanelJson {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  priority: string;
  pipelineStage: string;
  statusNote: string | null;
  /** docs/18 §7 — may edit stage/priority/status note (PM/lead, heads, execs). */
  canGovern?: boolean;
  status: string;
  dueDate: string | null;
  budget: string | null;
  team: string | null;
  client: string | null;
  objective: string | null;
  mission: string | null;
  businessOwner: string | null;
  startDate: string | null;
  portfolioName: string | null;
  programmeName: string | null;
  avgProgress: number;
  canEdit: boolean; // project settings / team — lead, PM, heads, SuperAdmin
  canContribute: boolean; // tasks + blockers — any project member (per Joyce)
  canPublish?: boolean; // plan approval (Draft → Published) — PM-level (DM1.15 №3)
  viewerCategory?: "PM" | "Dev" | "QA" | "Stakeholder"; // default board lens (6.2)
  isMember: boolean; // the viewer leads or is allocated to this project
  subsidiaries: {
    orgUnitId: string;
    code: string;
    name: string;
    flag: string | null;
    progress: number;
    status: string;
  }[];
}

interface ProjectPanelContentProps {
  data: ProjectPanelJson;
  onUpdated: () => void;
}

export function ProjectPanelContent({ data, onUpdated }: ProjectPanelContentProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="sticky top-0 z-10 gap-0.5 border-b border-background bg-white p-[22px_26px_18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="mb-[3px] text-[10px] font-semibold tracking-[1px] text-brand uppercase">
            {data.code} · {data.type} · {data.priority} Priority
          </div>
          {data.canEdit && <EditProjectDialog project={data} onUpdated={onUpdated} />}
        </div>
        <SheetTitle className="font-heading text-lg font-bold tracking-[-0.3px] text-foreground">
          {data.name}
        </SheetTitle>
        <p className="mt-0.5 text-[11px] text-ink-3">
          {data.portfolioName ? `${data.portfolioName} Portfolio · ` : "Standalone · "}
          {data.programmeName ? `${data.programmeName} · ` : ""}
          Due: {formatDate(data.dueDate)} · Budget: {data.budget ?? "—"}
        </p>
      </SheetHeader>

      <div className="flex flex-col gap-[22px] p-[22px_26px]">
        <Link
          href={`/projects/${data.id}`}
          className="flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--w10)] bg-[var(--w04)] px-4 py-2.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
        >
          Open project workspace <ArrowUpRight className="size-4" />
        </Link>

        {data.description && <p className="text-xs text-ink-2">{data.description}</p>}

        <div className="grid grid-cols-4 gap-2.5">
          <StatTile
            label="Overall Progress"
            value={`${data.avgProgress}%`}
            valueClassName={statusTextClass(data.status)}
          />
          <StatTile label="Status" value={<StatusPill status={data.status} />} />
          <StatTile label="Subsidiaries" value={data.subsidiaries.length} />
          <StatTile label="Budget" value={data.budget ?? "—"} valueClassName="text-[15px]" />
        </div>

        {data.team && (
          <p className="-mt-3 text-xs text-ink-3">
            <span className="font-medium text-ink-2">Team:</span> {data.team}
          </p>
        )}

        {(data.client || data.businessOwner || data.objective || data.mission || data.startDate) && (
          <div className="flex flex-col gap-2 rounded-[8px] bg-background p-[13px_15px]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {data.client && <DefItem label="Client" value={data.client} />}
              {data.businessOwner && <DefItem label="Business Owner" value={data.businessOwner} />}
              {(data.startDate || data.dueDate) && (
                <DefItem label="Timeline" value={`${formatDate(data.startDate)} → ${formatDate(data.dueDate)}`} />
              )}
            </div>
            {data.objective && <DefItem label="Objective" value={data.objective} />}
            {data.mission && <DefItem label="Mission" value={data.mission} />}
          </div>
        )}

        <ProjectResourcesSection projectId={data.id} canEdit={data.canEdit} />

        <ProjectTasksSection projectId={data.id} canEdit={data.canContribute} />

        <ProjectBlockersSection projectId={data.id} canEdit={data.canContribute} />

        <AskQAbout type="project" targetId={data.id} label="Ask Q about this project" />

        {/* Milestones live in the workspace Deadlines tab since the M1 model merge —
            subsidiary context is carried in each milestone's name. */}
        {data.subsidiaries.length > 0 && (
        <div>
          <div className="mb-2.5 text-[13px] font-semibold text-foreground">Progress by Subsidiary</div>
          <div className="flex flex-col gap-2">
            {data.subsidiaries.map((sub) => (
              <div key={sub.orgUnitId} className="rounded-[6px] bg-background p-[13px_15px]">
                <div className="mb-[7px] flex items-center justify-between">
                  <div className="text-xs font-semibold text-foreground">
                    {sub.flag} {sub.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={sub.status} />
                    <span className={cn("text-[15px] font-bold tracking-[-0.4px]", statusTextClass(sub.status))}>
                      {sub.progress}%
                    </span>
                  </div>
                </div>
                <div className="h-[7px] overflow-hidden rounded-full bg-ink-4">
                  <div
                    className={cn("h-full rounded-full transition-[width]", statusBarClass(sub.status))}
                    style={{ width: `${sub.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function DefItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-ink-3">{label}</div>
      <div className="text-xs text-ink-2">{value}</div>
    </div>
  );
}
