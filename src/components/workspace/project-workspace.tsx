"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, ArrowRight } from "lucide-react";
import { formatDate } from "@/components/panels/panel-primitives";
import { EditProjectDialog } from "@/components/panels/edit-project-dialog";
import { ProjectResourcesSection } from "@/components/panels/project-resources-section";
import { ProjectBoard } from "@/components/workspace/project-board";
import { ProjectMilestonesSection } from "@/components/workspace/project-milestones-section";
import { DocumentsSection } from "@/components/workspace/documents-section";
import { IntegrationsGrid } from "@/components/workspace/integrations-grid";
import { AskQAbout } from "@/components/q/ask-q-about";
import { ActivityCard } from "@/components/conversation/activity-card";
import { CommentsSection } from "@/components/conversation/comments-section";
import { WorkspaceReports } from "@/components/workspace/workspace-reports";
import { WeekActivity } from "@/components/workspace/week-activity";
import { ReportHistory } from "@/components/workspace/report-history";
import { GovernanceEditor } from "@/components/workspace/governance-editor";
import { CheckpointMatrix } from "@/components/workspace/checkpoint-matrix";
import { ProjectRegister } from "@/components/workspace/project-register";
import { RequirementsPanel } from "@/components/workspace/requirements-panel";
import { RequestToJoinButton } from "@/components/workspace/request-to-join-button";
import { statusMeta } from "@/lib/project-view";
import type { ProjectPanelJson } from "@/components/panels/project-panel-json";
import { CARD_GLASS as CARD, RAG_TOKEN } from "@/lib/surface";

// Workspace redesign (docs/38): a "This week" home built for weekly reporting —
// the auto-drafted report + the YouTrack task feed it draws from, side by side —
// with Delivery setup, the full Board, Docs & register, and Setup as focused
// sub-views one click away. Rollout-at-a-glance surfaces here only for multi-market
// projects; every market's full track lives under Delivery.
const TABS = ["This week", "Delivery", "Board", "Docs & register", "Setup"] as const;
type Tab = (typeof TABS)[number];

// Old deep links keep landing: retired tab keys alias to their new homes.
const TAB_ALIASES: Record<string, Tab> = {
  Overview: "This week",
  Reports: "This week",
  Deadlines: "Delivery",
  Documents: "Docs & register",
  Team: "Setup",
  Integrations: "Setup",
};

const STAGE_TOKEN: Record<string, string> = { Exploring: "--qinfo", Evaluating: "--warn", Approved: "--ok", Paused: "--ink4" };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function timeline(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000);
  const d = new Date(dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} to close · ${d}`;
  if (days === 0) return `Due today · ${d}`;
  return `${-days} ${days === -1 ? "day" : "days"} overdue · ${d}`;
}

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
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => {
    const aliased = (initialTab && TAB_ALIASES[initialTab]) || initialTab;
    return TABS.includes(aliased as Tab) ? (aliased as Tab) : focusTaskId ? "Board" : "This week";
  });
  const canEdit = data.canEdit;
  const canContribute = data.canContribute;
  const eyebrow = [data.portfolioName, data.programmeName].filter(Boolean).join(" · ") || "Standalone";
  const tl = timeline(data.dueDate);
  const sm = statusMeta(data.status);
  const pct = data.avgProgress;
  const barTok = data.status === "Overdue" ? "--bad" : data.status === "AtRisk" ? "--warn" : "--brand";
  const stageTok = STAGE_TOKEN[data.pipelineStage] ?? "--ink4";

  const markets = data.marketTracks ?? [];
  const multiMarket = markets.length > 1;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[18px_24px_90px]">
      <Link href="/projects" className="flex w-fit items-center gap-1.5 text-[12px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand [animation:rise_.4s_cubic-bezier(.22,1,.36,1)_both]">
        <ArrowLeft className="size-3.5" /> Projects
      </Link>

      {/* Hero */}
      <section className={`relative overflow-hidden p-[24px_28px] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.03s_both] ${CARD}`} style={{ background: "var(--cardbg)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(800px 300px at 6% -50%, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-[22px]">
          <div className="min-w-0 flex-1">
            <div className="mb-2 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.2px] text-[var(--ink4)]">{eyebrow} · {data.code}</div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-[29px] rv:text-heading-lg font-bold tracking-[-.9px] text-[var(--qink)]">{data.name}</h1>
              <span
                className="rounded-[5px] p-[4px_8px] font-mono text-[9.5px] font-semibold tracking-[1px]"
                style={{ color: `var(${sm.tok})`, border: `1px solid color-mix(in oklab, var(${sm.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${sm.tok}) 9%, transparent)` }}
              >
                {sm.label}
              </span>
              <span
                className="rounded-[5px] p-[4px_8px] font-mono text-[9.5px] font-semibold tracking-[1px]"
                style={{ color: `var(${stageTok})`, border: `1px solid color-mix(in oklab, var(${stageTok}) 35%, transparent)`, background: `color-mix(in oklab, var(${stageTok}) 9%, transparent)` }}
                title="Pipeline stage — edited in the Governance card"
              >
                {data.pipelineStage.toUpperCase()}
              </span>
              {canEdit && <EditProjectDialog project={data} onUpdated={() => router.refresh()} />}
            </div>
            {data.description && <p className="mt-[7px] max-w-[520px] text-[13px] rv:text-body-sm text-[var(--ink3)]">{data.description}</p>}
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <span className="h-[5px] w-[280px] max-w-full overflow-hidden rounded-full bg-[var(--wash2)]">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `var(${barTok})` }} />
              </span>
              <span className="font-heading text-[16px] font-bold tabular-nums text-[var(--qink)]">{pct}%</span>
              <span className="font-mono rv:font-sans text-[9.5px] rv:text-overline tracking-[1px] text-[var(--ink4)]">PROGRESS</span>
              {tl && (
                <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
                  <Clock className="size-3.5" /> {tl}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5">
                {members.slice(0, 5).map((m, i) => (
                  <span key={i} className="flex size-[30px] items-center justify-center rounded-full border-2 border-[var(--qbg)] text-[10px] font-bold" style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)", color: "var(--brand)" }} title={m.name}>
                    {initials(m.name)}
                  </span>
                ))}
              </div>
              <span className="text-[12px] text-[var(--ink3)]">{members.length} {members.length === 1 ? "member" : "members"}</span>
            </div>
            <AskQAbout type="project" targetId={data.id} label="Ask Q about this project" />
            {!data.isMember && <RequestToJoinButton projectId={data.id} />}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{
                borderColor: active ? "var(--brand)" : "var(--hair)",
                background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink3)",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {tab === "This week" && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_360px]">
            <div className="flex min-w-0 flex-col gap-3.5">
              {/* One narrative, top to bottom: the act, its evidence, then the trail.
                  Act + evidence sit tight (gap-2) so they read as one unit; history
                  stands off at the column's normal rhythm. */}
              <div className="flex flex-col gap-2">
                {/* The weekly check-in — auto-drafted from the feed below; the PM edits
                    the one line, sets RAG, confirms and sends to the Head. */}
                <WorkspaceReports projectId={data.id} isPmView={data.canGovern ?? false} />
                {/* The evidence the draft is built from — what moved on the tracker this week. */}
                <WeekActivity projectId={data.id} />
              </div>
              <ReportHistory projectId={data.id} />
            </div>
            <aside className="flex flex-col gap-3.5">
              {/* Multi-market only: per-subsidiary rollout at a glance; full tracks under Delivery. */}
              {multiMarket && (
                <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold text-foreground">Rollout by market</span>
                    <button type="button" onClick={() => setTab("Delivery")} className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand">
                      Delivery <ArrowRight className="size-3" />
                    </button>
                  </div>
                  <div className="flex flex-col">
                    {markets.map((m) => {
                      const tok = RAG_TOKEN[m.status] ?? "--ink4";
                      return (
                        <Link
                          key={m.orgUnitId}
                          href={`/projects/${data.id}/markets/${m.orgUnitId}`}
                          className="flex items-center gap-2.5 border-b border-[var(--hair2)] py-2 last:border-0 transition-colors hover:text-brand"
                        >
                          <span className="size-2 flex-none rounded-full" style={{ background: `var(${tok})` }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--qink)]">
                            {m.flag ? `${m.flag} ` : ""}{m.code}
                          </span>
                          <span className="flex-none font-mono text-[10.5px] tabular-nums text-[var(--ink4)]">{m.progress}%</span>
                          <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Governance facts, inline-editable by the right roles. */}
              <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
                <GovernanceEditor
                  projectId={data.id}
                  pipelineStage={data.pipelineStage}
                  priority={data.priority}
                  statusNote={data.statusNote}
                  portfolioId={data.portfolioId}
                  portfolios={data.portfolios}
                  budget={data.budget}
                  canGovern={data.canGovern ?? false}
                />
                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--hair2)] pt-3">
                  {data.businessOwner && <Def label="Business Owner" value={data.businessOwner} />}
                  {data.client && <Def label="Client" value={data.client} />}
                  <Def label="Timeline" value={`${formatDate(data.startDate)} → ${formatDate(data.dueDate)}`} />
                  {data.objective && <Def label="Objective" value={data.objective} />}
                  {(data.ideaProvenance?.length ?? 0) > 0 && (
                    <div className="border-t border-[var(--hair2)] pt-3">
                      <div className="mb-1.5 font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1px] text-[var(--ink4)]">Where this came from</div>
                      <div className="flex flex-col gap-1.5">
                        {data.ideaProvenance!.map((i) => (
                          <div key={i.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                            <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
                              {i.kind === "accepted" ? "idea accepted" : "idea merged in"}
                            </span>
                            <span className="min-w-0 flex-1 text-ink-2">{i.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
                <ActivityCard projectId={data.id} />
              </div>
            </aside>
          </div>
        )}

        {tab === "Delivery" && (
          <div className="flex flex-col gap-3.5">
            <p className="text-xs text-ink-3">
              Delivery setup: the checkpoint gates that derive the project&apos;s progress, its schedule, and — for
              multi-market projects — each subsidiary&apos;s rollout track.
            </p>
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <CheckpointMatrix projectId={data.id} />
            </div>
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <ProjectMilestonesSection projectId={data.id} canEdit={canEdit} />
            </div>
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-foreground">Market rollout</span>
                <span className="text-[10.5px] text-ink-3">weekly check-ins live on each market page</span>
              </div>
              {markets.length === 0 ? (
                <p className="text-xs text-ink-3">
                  No market tracks — this project ships to no subsidiaries yet. Markets are picked in the project
                  wizard or inherited from a Rollout portfolio.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {markets.map((m) => {
                    const tok = RAG_TOKEN[m.status] ?? "--brand";
                    return (
                      <a
                        key={m.orgUnitId}
                        href={`/projects/${data.id}/markets/${m.orgUnitId}`}
                        className="flex flex-col gap-1 rounded-[10px] border border-[var(--w07)] p-2.5 transition-colors hover:border-[var(--brand)]"
                      >
                        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                          <span className="size-1.5 rounded-full" style={{ background: `var(${tok})` }} aria-hidden />
                          {m.flag ? `${m.flag} ` : ""}{m.code}
                        </span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--wash2)]">
                          <div className="h-full rounded-full" style={{ width: `${m.progress}%`, background: `var(${tok})` }} />
                        </div>
                        <span className="text-[10.5px] text-ink-3">{m.progress}% · {m.status}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "Board" && (
          <ProjectBoard
            projectId={data.id}
            canEdit={canContribute}
            viewerCategory={data.viewerCategory ?? "Stakeholder"}
            viewerId={viewerId}
            focusTaskId={focusTaskId}
            initialLens={initialLens}
          />
        )}

        {tab === "Docs & register" && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_360px]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <DocumentsSection projectId={data.id} canEdit={canEdit} viewerId={viewerId ?? ""} />
              <RequirementsPanel projectId={data.id} />
              <CommentsSection entityType="project" entityId={data.id} viewerId={viewerId ?? ""} canPromote={canEdit} />
            </div>
            <aside>
              {/* One register — Blockers · Risks · Issues · Dependencies · Decisions · Lessons. */}
              <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
                <ProjectRegister
                  projectId={data.id}
                  canContribute={canContribute}
                  canGovern={data.canGovern ?? false}
                  projects={data.allProjects ?? []}
                />
              </div>
            </aside>
          </div>
        )}

        {tab === "Setup" && (
          <div className="flex flex-col gap-3.5">
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <div className="mb-2.5 text-[13px] font-semibold text-foreground">Team</div>
              <ProjectResourcesSection projectId={data.id} canEdit={canEdit} />
            </div>
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <div className="mb-1 text-[13px] font-semibold text-foreground">Integrations</div>
              <p className="mb-2.5 text-[11px] text-ink-3">Connect YouTrack here to mirror this project&apos;s tasks and drive the weekly report.</p>
              <IntegrationsGrid projectId={data.id} canEdit={canEdit} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1px] text-[var(--ink4)]">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-[var(--ink2)]">{value}</div>
    </div>
  );
}
