"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { SetupChecklist } from "@/components/workspace/setup-checklist";
import { MarketsTab } from "@/components/workspace/markets-tab";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InstancesSection } from "@/components/workspace/instances-section";
import { ModulesSection } from "@/components/workspace/modules-section";
import { MarketCheckInCard } from "@/components/workspace/market-checkin-card";
import { GatesByMarket } from "@/components/workspace/gates-by-market";
import { GateDrawer, type OpenGate } from "@/components/workspace/gate-drawer";
import { Columns, Panel } from "@/components/ui/panel";
import { Kv } from "@/components/ui/drawer";
import { Chip } from "@/components/ui/status-pill";
import { TextButton } from "@/components/ui/text-link";
import type { ProjectPanelJson } from "@/components/panels/project-panel-json";
import type { GateGrid } from "@/lib/gate-grid";
import { CARD, CARD_BG, FOCUS, TAB_COUNT } from "@/lib/surface";

// Milestone A (docs handoff §2), rebuilt to design spec v2 in Tier 3 — the workspace around
// the weekly act: a plain header (one status chip, the Market filter, Upload Status Report),
// seven tabs, and a "This week" home with the status update in the main column and "What
// Moved This Week" + Markets in the rail. Delivery leads with "Gates by Market". Every tab's
// content is an existing self-fetching component; the arrangement and the chrome changed.
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

// Tab labels in Title Case (D-F2b); the keys stay as they are for ?tab= deep links.
const TAB_LABEL: Record<Tab, string> = { "This week": "This Week", Delivery: "Delivery", Board: "Board", Documents: "Documents", Register: "Register", Discussion: "Discussion", Team: "Team" };

// UX7 (D12, U1): the seven tabs stay, in the shared block-tab style (the Tabs default
// variant) — no full-width line; the active tab gets the fill and the 2px brand border.

/** `?tab=` (or a legacy alias) → a tab, or null when it names nothing we have. */
function resolveTab(raw: string | undefined): Tab | null {
  const aliased = (raw && TAB_ALIASES[raw]) || raw;
  return TABS.includes(aliased as Tab) ? (aliased as Tab) : null;
}

export function ProjectWorkspace({
  data,
  gateGrid,
  pmName = null,
  members: _members,
  viewerId,
  initialTab,
  focusTaskId = null,
  initialLens = null,
}: {
  data: ProjectPanelJson;
  /** Tier 3 — the Delivery tab's gates per market, shaped on the server. */
  gateGrid: GateGrid;
  pmName?: string | null;
  members: { name: string }[];
  viewerId?: string;
  initialTab?: string;
  focusTaskId?: string | null;
  initialLens?: "all" | "dev" | "qa" | "impl" | null;
}) {
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab) ?? (focusTaskId ? "Board" : "This week"));
  // Deep links while ALREADY on the page (the board's "Connect under Team →", a bell link
  // to ?tab=Register, …) re-render this component with a new initialTab rather than
  // remounting it — follow it, and scroll to the section the hash names once it exists.
  useEffect(() => {
    const next = resolveTab(initialTab);
    if (next) setTab(next);
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [initialTab]);
  const { ci, setCi } = useCheckIn(data.id, data.checkin ?? null);
  // docs/38 — two selections, both written to the URL so links and reloads keep them:
  // ?market= (null = every market) scopes gates and the This week card to one market;
  // ?instance= (null = the product itself) scopes gates to one named instance.
  const router = useRouter();
  const pathname = usePathname();
  const marketsList = data.markets ?? [];
  const namedInstances = data.namedInstances ?? [];
  const modules = data.modules ?? [];
  const [market, setMarket] = useState<string | null>(data.initialMarket ?? null);
  const [instance, setInstance] = useState<string | null>(data.initialInstance ?? null);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [openGate, setOpenGate] = useState<OpenGate | null>(null);
  const selected = marketsList.find((i) => i.orgUnitId === market) ?? null;
  const selectedInstance = [...namedInstances, ...modules].find((i) => i.id === instance) ?? null;
  const writeQuery = (key: "market" | "instance", id: string | null) => {
    const q = new URLSearchParams(window.location.search);
    if (id) q.set(key, id);
    else q.delete(key);
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };
  const pickInstance = (id: string | null) => {
    setMarket(id);
    writeQuery("market", id);
  };
  const pickNamed = (id: string | null) => {
    setInstance(id);
    writeQuery("instance", id);
  };
  const canEdit = data.canEdit;
  const canContribute = data.canContribute;
  const canGovern = data.canGovern ?? false;
  const registerCount = data.registerOpenCount ?? 0;

  // Where the project stands: the selected market's current gate, else the product's, else
  // its pipeline stage when there is no gate template.
  const marketRow = selected ? gateGrid.rows.find((r) => r.orgUnitId === selected.orgUnitId) : null;
  const stage = (marketRow ?? gateGrid.product).currentGate ?? data.pipelineStage;
  const buildStatus = gateGrid.gates.length
    ? `${gateGrid.product.currentGate ?? data.pipelineStage} · ${gateGrid.product.done} of ${gateGrid.gates.length} gates done`
    : `${data.pipelineStage} · no gate template`;
  const headerStatus = selected ? selected.rag : (ci?.overallRag ?? null);
  // "Market Check-ins" on the status card opens the first market still to check in.
  const goToMarkets = () => {
    const next = marketsList.find((m) => !m.checkIn) ?? marketsList[0];
    if (next) pickInstance(next.orgUnitId);
  };

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.03s_both]">
        <WorkspaceHeader
          data={data}
          status={headerStatus}
          stage={stage}
          pmName={pmName}
          marketOptions={marketsList.map((m) => ({ value: m.orgUnitId, label: `${m.flag ? `${m.flag} ` : ""}${m.name}` }))}
          market={market ?? ""}
          onMarket={(v) => pickInstance(v || null)}
          instanceOptions={namedInstances.map((i) => ({ value: i.id, label: i.name }))}
          instance={instance ?? ""}
          onInstance={(v) => pickNamed(v || null)}
          selectedLabel={[selectedInstance?.name, selected ? `${selected.flag ? `${selected.flag} ` : ""}${selected.name}` : null].filter(Boolean).join(" in ") || null}
          onTeam={() => setTab("Team")}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
        <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
          <TabsList aria-label="Project sections" className="w-full justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="gap-2">
                {TAB_LABEL[t]}
                {t === "Register" && registerCount > 0 && (
                  <span className={TAB_COUNT} aria-label={`${registerCount} open`}>
                    {registerCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
          <TabsContent value="This week" className="mt-4">
            <Columns
              main={
                <>
                  {data.canSetUp && data.setup && data.setup.done < data.setup.total && (
                    <SetupChecklist projectId={data.id} code={data.code} setup={data.setup} onGo={(t) => setTab(t)} />
                  )}
                  {selected ? (
                    <section className="flex flex-col gap-2" aria-label={`${selected.name} this week`}>
                      <p className="text-[12.5px] text-[var(--ds-ink3)]">
                        <b className="font-semibold text-[var(--ds-ink)]">
                          {selected.flag ? `${selected.flag} ` : ""}
                          {selected.name}
                        </b>{" "}
                        · this week&apos;s market check-in. The product&apos;s own update is under{" "}
                        <button type="button" onClick={() => pickInstance(null)} className={`rounded-[4px] font-semibold text-[var(--ds-brand-ink)] underline-offset-2 hover:underline ${FOCUS}`}>
                          All markets
                        </button>
                        .
                      </p>
                      <MarketCheckInCard key={selected.orgUnitId} projectId={data.id} orgUnitId={selected.orgUnitId} initial={selected.checkIn} canGovern={canGovern} />
                    </section>
                  ) : (
                    ci && <StatusUpdateCard projectId={data.id} ci={ci} buildStatus={buildStatus} onChange={setCi} onGoToMarkets={goToMarkets} />
                  )}
                  <WeekActivity projectId={data.id} canNudge={canGovern} />
                  <ReportHistory projectId={data.id} />
                </>
              }
              rail={
                <>
                  <Panel title="What Moved This Week" labelledBy="ws-moved">
                    {ci && ci.lines.length > 0 ? (
                      <ul className="m-0 flex list-disc flex-col gap-[5px] pl-[18px] text-[13px] text-[var(--ds-ink2)]">
                        {ci.lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12.5px] text-[var(--ds-ink3)]">Nothing moved on the board yet this week.</p>
                    )}
                  </Panel>
                  {(marketsList.length > 0 || canGovern) && (
                    <Panel title="Markets" labelledBy="ws-markets" action={canGovern ? <TextButton onClick={() => setMarketsOpen(true)}>Manage</TextButton> : undefined}>
                      {marketsList.length === 0 ? (
                        <p className="text-[12.5px] text-[var(--ds-ink3)]">This product ships to no market yet.</p>
                      ) : (
                        <Kv
                          rows={marketsList.map((m): [string, React.ReactNode] => {
                            const row = gateGrid.rows.find((r) => r.orgUnitId === m.orgUnitId);
                            return [
                              `${m.flag ? `${m.flag} ` : ""}${m.name}`,
                              <button
                                key={m.orgUnitId}
                                type="button"
                                onClick={() => pickInstance(m.orgUnitId)}
                                aria-pressed={market === m.orgUnitId}
                                aria-label={`${m.name}: ${row?.currentGate ?? m.status}${m.checkIn ? "" : ", no check-in this week"}. Open its check-in`}
                                className={`inline-flex flex-wrap items-center gap-1.5 rounded-[4px] text-left hover:text-[var(--ds-brand-ink)] aria-pressed:text-[var(--ds-brand-ink)] ${FOCUS}`}
                              >
                                {row?.currentGate ?? m.status}
                                {!m.checkIn && <Chip tone="warn">No check-in</Chip>}
                              </button>,
                            ];
                          })}
                        />
                      )}
                    </Panel>
                  )}
                  <DetailsCard data={data} canGovern={canGovern} />
                </>
              }
            />
          </TabsContent>

          <TabsContent value="Delivery" className="mt-4">
            <div className="flex flex-col gap-4">
              <GatesByMarket grid={gateGrid} market={market} onOpen={setOpenGate} onManage={canGovern ? () => setMarketsOpen(true) : undefined} />
              <Panel title={selectedInstance ? `${selectedInstance.name}${selected ? ` in ${selected.name}` : ""} · Gates` : selected ? `${selected.name} · Gates` : "Product Track"} labelledBy="ws-track">
                {!selected && !selectedInstance && marketsList.length > 0 && (
                  <p className="text-[12.5px] text-[var(--ds-ink3)]">The template and the product&apos;s own gates. A gate changed here changes it in every market; use the grid above to change one market.</p>
                )}
                {(selected || selectedInstance) && (
                  <p className="text-[12.5px] text-[var(--ds-ink3)]">
                    {selectedInstance
                      ? `${selectedInstance.name}'s own gate states${selected ? ` in ${selected.name}` : " at product level"}, the same track in every market. The product's are under All markets.`
                      : "This market's own gate states. The product's are under All markets. Same template, recorded per market."}
                  </p>
                )}
                <CheckpointMatrix key={`${market ?? "all"}:${instance ?? "product"}`} projectId={data.id} orgUnitId={market} moduleId={instance} />
              </Panel>
              <InstancesSection
                projectId={data.id}
                initial={namedInstances}
                markets={marketsList.map((m) => ({ orgUnitId: m.orgUnitId, code: m.code, flag: m.flag }))}
                canManage={canGovern}
                selected={{ instance, market }}
                onSelect={(instanceId, orgUnitId) => {
                  pickNamed(instanceId);
                  pickInstance(orgUnitId);
                }}
              />
              <ModulesSection
                projectId={data.id}
                label={data.moduleLabel ?? "Modules"}
                initial={modules}
                instances={namedInstances.map((i) => ({ id: i.id, name: i.name }))}
                markets={marketsList.map((m) => ({ orgUnitId: m.orgUnitId, code: m.code, flag: m.flag }))}
                canManage={canGovern}
                selected={{ instance, market }}
                onSelect={(moduleId, orgUnitId) => {
                  pickNamed(moduleId);
                  pickInstance(orgUnitId);
                }}
              />
              <div className={`${CARD} p-4`} style={CARD_BG}>
                <ProjectMilestonesSection projectId={data.id} canEdit={canEdit} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="Board" className="mt-4">
            <ProjectBoard
              projectId={data.id}
              canEdit={canContribute}
              viewerCategory={data.viewerCategory ?? "Stakeholder"}
              viewerId={viewerId}
              focusTaskId={focusTaskId}
              initialLens={initialLens}
            />
          </TabsContent>

          <TabsContent value="Documents" className="mt-4">
            <div className="flex flex-col gap-4">
              <DocumentsSection projectId={data.id} canEdit={canEdit} viewerId={viewerId ?? ""} />
              <RequirementsPanel projectId={data.id} />
            </div>
          </TabsContent>

          <TabsContent value="Register" className="mt-4">
            {/* One register — Blockers · Risks · Issues · Dependencies · Decisions · Lessons. */}
            <div className={`${CARD} p-4`} style={CARD_BG}>
              <ProjectRegister projectId={data.id} canContribute={canContribute} canGovern={canGovern} projects={data.allProjects ?? []} />
            </div>
          </TabsContent>

          <TabsContent value="Discussion" className="mt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
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

          <TabsContent value="Team" className="mt-4">
            <div className="flex flex-col gap-4">
              <Panel title="Team" labelledBy="ws-team">
                <ProjectResourcesSection projectId={data.id} canEdit={canEdit} />
              </Panel>
              <div id="integrations" className="scroll-mt-20">
                <Panel title="Integrations" labelledBy="ws-integrations">
                  <p className="-mt-1 text-[12.5px] text-[var(--ds-ink3)]">Connect YouTrack here to mirror this project&apos;s tasks and drive the weekly status update.</p>
                  <IntegrationsGrid projectId={data.id} canEdit={canEdit} />
                </Panel>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <GateDrawer projectId={data.id} gate={openGate} onClose={() => setOpenGate(null)} onSaved={() => router.refresh()} />

      {/* docs/38 — markets are managed from Manage on the Markets card and the gates grid. */}
      <Dialog open={marketsOpen} onOpenChange={setMarketsOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-[860px]">
          <DialogTitle className="sr-only">Markets</DialogTitle>
          <MarketsTab
              projectId={data.id}
              label="Market"
              pmScope={data.pmScope ?? "product"}
              initial={marketsList.map((i) => ({ orgUnitId: i.orgUnitId, code: i.code, name: i.name, flag: i.flag, kind: i.kind, status: i.status, progress: i.progress, leadUserId: i.leadUserId, leadName: i.leadName, note: i.note }))}
              onSelect={(id) => {
                pickInstance(id);
                setMarketsOpen(false);
                setTab("This week");
              }}
            />
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** Details — the governance facts as a definition list; the edit controls (stage,
 * priority, portfolio, status note) sit behind Edit instead of living in the rail. */
function DetailsCard({ data, canGovern }: { data: ProjectPanelJson; canGovern: boolean }) {
  const [editing, setEditing] = useState(false);
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (data.description) rows.push({ label: "About", value: data.description });
  if (data.businessOwner) rows.push({ label: "Owner", value: data.businessOwner });
  if (data.client) rows.push({ label: "Client", value: data.client });
  rows.push({ label: "Stage", value: data.pipelineStage });
  rows.push({ label: "Priority", value: data.priority });
  if (data.startDate || data.dueDate) rows.push({ label: "Timeline", value: `${formatDate(data.startDate)} → ${formatDate(data.dueDate)}` });
  rows.push({ label: "Budget", value: data.budget ?? <span className="text-[var(--ds-ink3)]">Not yet captured</span> });
  if (data.objective) rows.push({ label: "Objective", value: data.objective });
  for (const i of data.ideaProvenance ?? []) {
    rows.push({ label: "Origin", value: `${i.kind === "accepted" ? "Idea" : "Idea merged"} · ${i.title}` });
  }
  if (data.statusNote) rows.push({ label: "Note", value: <span className="italic">“{data.statusNote}”</span> });

  return (
    <Panel title="Details" labelledBy="ws-details" action={canGovern ? <TextButton onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit"}</TextButton> : undefined}>
      {editing && (
        <div className="border-b border-dotted border-[var(--ds-line)] pb-3">
          <GovernanceEditor
            projectId={data.id}
            pipelineStage={data.pipelineStage}
            priority={data.priority}
            statusNote={data.statusNote}
            portfolioId={data.portfolioId}
            portfolios={data.portfolios}
            budget={data.budget}
            canGovern={canGovern}
            shape={{ instanceTagging: data.instanceTagging ?? true, pmScope: data.pmScope ?? "product", moduleLabel: data.moduleLabel ?? "Modules" }}
          />
        </div>
      )}
      <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
        {rows.map((r, i) => (
          <div key={i} className="contents">
            <dt className="text-[var(--ds-ink3)]">{r.label}</dt>
            <dd className="min-w-0 text-[var(--ds-ink2)] [text-wrap:pretty]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
