"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, MoreHorizontal, Upload, Users } from "lucide-react";
import { EditProjectDialog } from "@/components/panels/edit-project-dialog";
import { useQ } from "@/components/q/q-provider";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { RequestToJoinButton } from "@/components/workspace/request-to-join-button";
import { PageHeader } from "@/components/list/page-header";
import { FilterSelect, type FilterOption } from "@/components/list/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { FOCUS, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import type { ProjectPanelJson } from "@/components/panels/project-panel-json";
import type { Rag } from "@/server/health";

/**
 * Tier 3 (design spec v2 `wsHead`) — the project workspace header: "Projects › name" crumb,
 * the name, a meta line of ONE status chip · stage · % complete · PM, and the actions on the
 * right: the Market filter chip and Upload Status Report. Ask Q, Export PDF and Team fold
 * into the overflow menu; the project's edit control sits beside them.
 */

const MENU_ITEM = "gap-2 rounded-[8px] px-[9px] py-[7px] text-[12.5px]";

export function WorkspaceHeader({
  data,
  status,
  stage,
  pmName,
  marketOptions,
  market,
  onMarket,
  instanceOptions,
  instance,
  onInstance,
  selectedLabel,
  onTeam,
}: {
  data: ProjectPanelJson;
  /** The one status chip: this week's overall status, or the selected market's. */
  status: Rag | null;
  /** Where the project stands (its current gate, else its pipeline stage). */
  stage: string;
  pmName: string | null;
  marketOptions: FilterOption[];
  /** "" = every market. */
  market: string;
  onMarket: (orgUnitId: string) => void;
  instanceOptions: FilterOption[];
  instance: string;
  onInstance: (id: string) => void;
  /** The selected market / instance, named in the meta line. */
  selectedLabel: string | null;
  onTeam: () => void;
}) {
  const router = useRouter();
  const { openQWith } = useQ();

  return (
    <PageHeader
      eyebrow={
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/projects" className={cn("rounded-[4px] hover:text-[var(--ds-ink)]", FOCUS)}>
                Projects
              </Link>
            </li>
            {data.portfolioName && data.portfolioId && (
              <>
                <li aria-hidden>›</li>
                <li>
                  <Link href={`/portfolios/${data.portfolioId}`} className={cn("rounded-[4px] hover:text-[var(--ds-ink)]", FOCUS)}>
                    {data.portfolioName}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden>›</li>
            <li aria-current="page">{data.name}</li>
          </ol>
        </nav>
      }
      title={data.name}
      description={
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {status ? <HealthPill value={status} /> : <Chip>No check-in</Chip>}
          {selectedLabel && <span className="text-[12.5px] font-semibold text-[var(--ds-ink2)]">{selectedLabel}</span>}
          <span className="text-[12.5px]">{stage}</span>
          <span className="text-[12.5px] tabular-nums">{data.avgProgress}% complete</span>
          <span className="text-[12.5px]">{pmName ? `PM ${pmName}` : "No PM yet"}</span>
          {data.setup && data.setup.done < data.setup.total && (
            <span className="text-[12.5px]" title="Delivery gates, documents, team, YouTrack, this week's update: the PM sets these up">
              Setup {data.setup.done} of {data.setup.total}
            </span>
          )}
        </span>
      }
      actions={
        <>
          {data.canEdit && <EditProjectDialog project={data} onUpdated={() => router.refresh()} />}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="More project actions" className={cn(SECONDARY, "w-[var(--ds-control-h)] px-0")}>
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)] ring-1 ring-[var(--ds-line)]">
              <DropdownMenuItem className={MENU_ITEM} onClick={() => openQWith({ type: "project", targetId: data.id, label: "Ask Q about this project" })}>
                <QubitLogo square={4} gap={1} radius={1} color="var(--ds-brand)" />
                Ask Q About This Project
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} render={<a href={`/api/reports/export?template=auto&project=${data.id}`} download />}>
                <FileDown aria-hidden />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onClick={onTeam}>
                <Users aria-hidden />
                Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!data.isMember && <RequestToJoinButton projectId={data.id} />}
          {marketOptions.length > 0 && <FilterSelect label="Market" allLabel="All markets" value={market} options={marketOptions} onChange={onMarket} />}
          {instanceOptions.length > 0 && <FilterSelect label="Instance" allLabel="The product" value={instance} options={instanceOptions} onChange={onInstance} />}
          {data.canSetUp && (
            <Link href="/reports/update?upload=1" className={SECONDARY}>
              <Upload className="size-3.5" aria-hidden /> Upload Status Report
            </Link>
          )}
        </>
      }
    />
  );
}
