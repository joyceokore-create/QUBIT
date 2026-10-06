"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/components/panels/panel-primitives";
import { ProjectResourcesSection } from "@/components/panels/project-resources-section";
import { ProjectBoard } from "@/components/workspace/project-board";
import { ProjectMilestonesSection } from "@/components/workspace/project-milestones-section";
import { DocumentsSection } from "@/components/workspace/documents-section";
import { IntegrationsGrid } from "@/components/workspace/integrations-grid";
import { ActivityCard } from "@/components/conversation/activity-card";
import { CommentsSection } from "@/components/conversation/comments-section";
import { WeekActivity } from "@/components/workspace/week-activity";
import { ReportHistory } from "@/components/workspace/report-history";
import { GovernanceEditor } from "@/components/workspace/governance-editor";
import { CheckpointMatrix } from "@/components/workspace/checkpoint-matrix";
import { ProjectRegister } from "@/components/workspace/project-register";
import { RequirementsPanel } from "@/components/workspace/requirements-panel";
import { StatusUpdateCard } from "@/components/workspace/status-update-card";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { useCheckIn } from "@/components/workspace/use-checkin";
import type { ProjectPanelJson } from "@/components/panels/project-panel-json";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, ragFill, ragToken } from "@/lib/surface";

// Milestone A (docs handoff §2) — the workspace, rearranged around the weekly act: a
// plain header, seven underline tabs, and a "This week" home that reads top to bottom as
// the status update (one card, one action) → what moved this week (its evidence) →
// previous weeks, with Markets and Details beside it. Every tab's content is an existing
// self-fetching component; only the arrangement changed.
const TABS = ["This week", "Delivery", "Board", "Documents", "Register", "Discussion", "Team"] as const;
type Tab = (typeof TABS)[number];

// Old deep links keep landing: retired tab keys alias to their new homes.
const TAB_ALIASES: Record<string, Tab> = {
  Overview: "This week",
  Reports: "This week",
  Deadlines: "Delivery",
  "Docs & register": "Documents",
  Setup: "Team",
  Integrations: "Team",
};

// Same variant prefixes as shadcn's own classes so twMerge replaces (not stacks) them.
const TRIGGER =
  "flex-none rounded-none px-2.5 py-2 text-[13px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] data-active:text-[var(--qink)] group-data-horizontal/tabs:after:bottom-[-1px] after:bg-[var(--brand)]";

export function ProjectWorkspace({
  data,
  members,
  viewerId,
  initialTab,
  focusTaskId = null,
  initialLens = null,
}: {
  data: ProjectPanelJson;
  members: { name: string }[];
  viewerId?: string;
  initialTab?: string;
  focusTaskId?: string | null;
  initialLens?: "all" | "dev" | "qa" | "impl" | null;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const aliased = (initialTab && TAB_ALIASES[initialTab]) || initialTab;
    return TABS.includes(aliased as Tab) ? (aliased as Tab) : focusTaskId ? "Board" : "This week";
  });
  const { ci, setCi } = useCheckIn(data.id, data.checkin ?? null);
  const canEdit = data.canEdit;
  const canContribute = data.canContribute;
  const canGovern = data.canGovern ?? false;
  const markets = data.marketTracks ?? [];
  const registerCount = data.registerOpenCount ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[18px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.03s_both]">
        <WorkspaceHeader data={data} members={members} onTeam={() => setTab("Team")} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
        <div className="border-b border-[var(--border)] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
          <TabsList variant="line" className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto p-0 [scrollbar-width:thin]">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className={TRIGGER}>
                {t}
                {t === "Register" && registerCount > 0 && (
                  <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 12%, transparent)" }}>
                    {registerCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
          <TabsContent value="This week" className="mt-5">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
                {ci && <StatusUpdateCard projectId={data.id} ci={ci} onChange={setCi} onGoToDelivery={() => setTab("Delivery")} />}
                <WeekActivity projectId={data.id} canNudge={canGovern} />
                <ReportHistory projectId={data.id} />
              </div>
              <aside className="flex flex-[1_1_280px] flex-col gap-5">
                {markets.length > 0 && (
                  <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="ws-markets">
                    <div className="mb-2.5 flex items-baseline justify-between">
                      <h2 id="ws-markets" className="text-[13px] font-semibold text-foreground">
                        Markets
                      </h2>
                      <button type="button" onClick={() => setTab("Delivery")} className={`flex items-center gap-0.5 rounded-[4px] text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand ${FOCUS}`}>
                        Delivery <ArrowRight className="size-3" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-col">
                      {markets.map((m) => (
                        <Link
                          key={m.orgUnitId}
                          href={`/projects/${data.id}/markets/${m.orgUnitId}`}
                          className={`grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-2.5 rounded-[4px] border-b border-[var(--hair2)] py-2 text-[12.5px] transition-colors last:border-0 hover:text-brand ${FOCUS}`}
                        >
                          <span className="truncate font-semibold text-[var(--qink)]">
                            {m.flag ? `${m.flag} ` : ""}
                            {m.code}
                          </span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-[var(--wash2)]" role="img" aria-label={`${m.code} ${m.progress}% · ${m.rag}`}>
                            <span className="block h-full rounded-full" style={{ width: `${m.progress}%`, ...ragFill(m.rag) }} />
                          </span>
                          <span className="text-right font-mono text-[10.5px] tabular-nums text-[var(--ink4)]">{m.progress}%</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
                <DetailsCard data={data} canGovern={canGovern} />
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="Delivery" className="mt-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3.5">
                <h3 className="text-[13px] font-semibold text-foreground">Build track</h3>
                <div className={`${CARD} p-4`} style={CARD_BG}>
                  <CheckpointMatrix projectId={data.id} />
                </div>
                <div className={`${CARD} p-4`} style={CARD_BG}>
                  <ProjectMilestonesSection projectId={data.id} canEdit={canEdit} />
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <h3 className="text-[13px] font-semibold text-foreground">In-market track</h3>
                <div className={`${CARD} p-4`} style={CARD_BG}>
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-foreground">Market rollout</span>
                    <span className="text-[10.5px] text-ink-3">weekly check-ins live on each market page</span>
                  </div>
                  {markets.length === 0 ? (
                    <p className="text-xs text-ink-3">
                      No market tracks — this project ships to no subsidiaries yet. Markets are picked in the project wizard or
                      inherited from a Rollout portfolio.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {markets.map((m) => {
                        const tok = ragToken(m.rag);
                        return (
                          <Link
                            key={m.orgUnitId}
                            href={`/projects/${data.id}/markets/${m.orgUnitId}`}
                            className={`flex flex-col gap-1 rounded-[10px] border border-[var(--w07)] p-2.5 transition-colors hover:border-[var(--brand)] ${FOCUS}`}
                          >
                            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                              <span className="size-1.5 rounded-full" style={{ background: `var(${tok})` }} aria-hidden />
                              {m.flag ? `${m.flag} ` : ""}
                              {m.code}
                            </span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--wash2)]">
                              <div className="h-full rounded-full" style={{ width: `${m.progress}%`, background: `var(${tok})` }} />
                            </div>
                            <span className="text-[10.5px] text-ink-3">
                              {m.progress}% · {m.rag}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="Board" className="mt-5">
            <ProjectBoard
              projectId={data.id}
              canEdit={canContribute}
              viewerCategory={data.viewerCategory ?? "Stakeholder"}
              viewerId={viewerId}
              focusTaskId={focusTaskId}
              initialLens={initialLens}
            />
          </TabsContent>

          <TabsContent value="Documents" className="mt-5">
            <div className="flex flex-col gap-5">
              <DocumentsSection projectId={data.id} canEdit={canEdit} viewerId={viewerId ?? ""} />
              <RequirementsPanel projectId={data.id} />
            </div>
          </TabsContent>

          <TabsContent value="Register" className="mt-5">
            {/* One register — Blockers · Risks · Issues · Dependencies · Decisions · Lessons. */}
            <div className={`${CARD} p-4`} style={CARD_BG}>
              <ProjectRegister projectId={data.id} canContribute={canContribute} canGovern={canGovern} projects={data.allProjects ?? []} />
            </div>
          </TabsContent>

          <TabsContent value="Discussion" className="mt-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
              <div className="min-w-0">
                <CommentsSection entityType="project" entityId={data.id} viewerId={viewerId ?? ""} canPromote={canEdit} />
              </div>
              <aside>
                <div className={`${CARD} p-4`} style={CARD_BG}>
                  <ActivityCard projectId={data.id} />
                </div>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="Team" className="mt-5">
            <div className="flex flex-col gap-5">
              <div className={`${CARD} p-4`} style={CARD_BG}>
                <div className="mb-2.5 text-[13px] font-semibold text-foreground">Team</div>
                <ProjectResourcesSection projectId={data.id} canEdit={canEdit} />
              </div>
              <div className={`${CARD} p-4`} style={CARD_BG}>
                <div className="mb-1 text-[13px] font-semibold text-foreground">Integrations</div>
                <p className="mb-2.5 text-[11px] text-ink-3">Connect YouTrack here to mirror this project&apos;s tasks and drive the weekly status update.</p>
                <IntegrationsGrid projectId={data.id} canEdit={canEdit} />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </main>
  );
}

/** Details — the governance facts as a definition list; the edit controls (stage,
 * priority, portfolio, status note) sit behind Edit instead of living in the sidebar. */
function DetailsCard({ data, canGovern }: { data: ProjectPanelJson; canGovern: boolean }) {
  const [editing, setEditing] = useState(false);
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (data.businessOwner) rows.push({ label: "Owner", value: data.businessOwner });
  if (data.client) rows.push({ label: "Client", value: data.client });
  rows.push({ label: "Stage", value: data.pipelineStage });
  if (data.startDate || data.dueDate) rows.push({ label: "Timeline", value: `${formatDate(data.startDate)} → ${formatDate(data.dueDate)}` });
  rows.push({ label: "Budget", value: data.budget ?? <span className="text-[var(--ink5)]">Not yet captured</span> });
  if (data.objective) rows.push({ label: "Objective", value: data.objective });
  for (const i of data.ideaProvenance ?? []) {
    rows.push({ label: "Origin", value: `${i.kind === "accepted" ? "Idea" : "Idea merged"} · ${i.title}` });
  }
  if (data.statusNote) rows.push({ label: "Note", value: <span className="italic">“{data.statusNote}”</span> });

  return (
    <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="ws-details">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 id="ws-details" className="text-[13px] font-semibold text-foreground">
          Details
        </h2>
        {canGovern && (
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
            className={`rounded-[4px] text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand ${FOCUS}`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mb-3 border-b border-[var(--hair2)] pb-3">
          <GovernanceEditor
            projectId={data.id}
            pipelineStage={data.pipelineStage}
            priority={data.priority}
            statusNote={data.statusNote}
            portfolioId={data.portfolioId}
            portfolios={data.portfolios}
            budget={data.budget}
            canGovern={canGovern}
          />
        </div>
      )}
      <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12px]">
        {rows.map((r, i) => (
          <div key={i} className="contents">
            <dt className="text-[var(--ink4)]">{r.label}</dt>
            <dd className="min-w-0 text-[var(--ink2)] [text-wrap:pretty]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
