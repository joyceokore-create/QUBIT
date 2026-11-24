"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GateReviewDrawer, type GateTarget } from "@/components/gates/gate-review";
import type { GateQueueItem } from "@/lib/gate-approval";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Meter } from "@/components/ui/kpi-charts";
import { Chip } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Columns, Foot, ListRow, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { PageHeader } from "@/components/list/page-header";
import { useListUrl } from "@/components/list/use-list-url";
import { buildQueue, coverageList, QH_TAB_LABEL, QH_TABS, qhKpis, type QhData, type QhTab } from "@/lib/quality-home";
import type { TesterLoad } from "@/server/testers-this-week";
import { COMPACT, FOCUS, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX9 + UX fidelity Tier 1 — Head of QA › Quality Home, built to design spec v2 (docs/08).
 * Brief → four KPI cards → the "Quality Queue" panel (Testing Gates · Critical Issues · Test
 * Tasks) → Requirement Coverage and Testers This Week. WS1 (Tier 4): the Testing Gates tab
 * lists testing gates submitted for sign-off; Review opens drawer 14 "Sign Off a Testing
 * Gate" in place (Return to PM / Sign Off with Exception).
 */

const EMPTY: Record<QhTab, string> = {
  gates: "No testing gates waiting for sign-off",
  critical: "No critical issues open",
  tasks: "No test tasks are unassigned or overdue",
};

export function QualityHome({ data, gates = [], testers, brief, nowIso }: { data: QhData; gates?: GateQueueItem[]; testers: TesterLoad[]; brief: ReactNode; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const router = useRouter();
  const [review, setReview] = useState<GateTarget | null>(null);
  const items = useMemo(() => buildQueue(data, now, gates), [data, now, gates]);
  const k = qhKpis(data, gates);
  const coverage = coverageList(data);
  const list = useListUrl("quality-home", 10);
  const counts = Object.fromEntries(QH_TABS.map((t) => [t, items.filter((i) => i.tab === t).length])) as Record<QhTab, number>;
  const raw = list.get("tab") as QhTab;
  const tab: QhTab = QH_TABS.includes(raw) ? raw : (QH_TABS.find((t) => counts[t] > 0) ?? "gates");
  const shown = items.filter((i) => i.tab === tab);
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: data.timeZone }).format(now).replace(",", "");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={dateLine} title="Quality Home" description="Testing gates, critical issues and test coverage across delivery." />

      {brief}

      <KpiRow count={4} label="Your numbers">
        <KpiCard
          label="Projects in Testing"
          value={k.inTesting}
          unit={data.projects.length ? `of ${data.projects.length}` : undefined}
          context="At SIT or UAT"
          chart={data.projects.length ? <Meter value={k.inTesting} max={data.projects.length} /> : undefined}
        />
        <KpiCard
          label="Testing Gates Waiting"
          value={k.testingGates}
          context={k.gatesBlocked ? `${k.gatesBlocked} held by critical issues` : k.testingGates ? "UAT and SIT sign-offs" : "None waiting"}
          contextTone={k.gatesBlocked ? "bad" : "neutral"}
          chart={k.testingGates ? <Meter value={k.gatesBlocked} max={k.testingGates} tone="warn" /> : undefined}
        />
        <KpiCard
          label="Critical Issues Open"
          value={k.criticalOpen}
          context={k.criticalOpen ? `Across ${k.criticalProjects} ${k.criticalProjects === 1 ? "project" : "projects"}` : "None open"}
          contextTone={k.criticalOpen ? "bad" : "good"}
        />
        <KpiCard label="Test Tasks Overdue" value={k.overdueTests} context={k.overdueTests ? `Across ${k.overdueProjects} ${k.overdueProjects === 1 ? "project" : "projects"}` : "None overdue"} />
      </KpiRow>

      <Columns
        main={
          <Panel title="Quality Queue" labelledBy="qa-queue" action={<TextLink href="/approvals?tab=gates">Open Approvals</TextLink>}>
            <nav aria-label="Quality queue views">
              <ul className={TABS_ROW}>
                {QH_TABS.map((t) => (
                  <li key={t}>
                    <button type="button" aria-current={t === tab ? "page" : undefined} onClick={() => list.set({ tab: t })} className={cn(TAB, t === tab && TAB_ACTIVE_ON_CARD)}>
                      {QH_TAB_LABEL[t]}
                      <span className={TAB_COUNT}>{counts[t]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
                <p className="text-[14px] font-semibold text-[var(--ds-ink)]">{EMPTY[tab]}</p>
                <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">Items appear here as projects reach testing, critical issues are raised, or test tasks slip.</p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((it) => (
                  <ListRow
                    key={it.id}
                    title={it.title}
                    sub={it.sub}
                    chip={<Chip tone={it.chip.tone}>{it.chip.label}</Chip>}
                    meta={it.when}
                    action={
                      it.gate ? (
                        <button type="button" onClick={() => setReview(it.gate!)} className={COMPACT}>
                          Review
                        </button>
                      ) : (
                        <Link href={it.href} className={COMPACT}>
                          Open
                        </Link>
                      )
                    }
                  />
                ))}
              </ul>
            )}
            <Foot>
              {tab === "gates"
                ? "Testing gates submitted for your sign-off. Signing off with critical issues open records an exception."
                : "Head of QA can still raise and edit risks and issues from Risks & Issues."}
            </Foot>
          </Panel>
        }
        rail={
          <>
            <Panel title="Requirement Coverage" action={<TextLink href="/reports?tab=quality">Reports</TextLink>}>
              {coverage.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">No project tracks requirements yet. Coverage appears once requirements are linked to tasks.</p>
              ) : (
                <PanelList>
                  {coverage.slice(0, 6).map((c) => (
                    <PanelRow
                      key={c.id}
                      title={
                        <Link href={`/projects/${c.id}`} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                          {c.name}
                        </Link>
                      }
                      sub={`${c.pct}% of requirements have tests`}
                    >
                      <Meter value={c.pct} max={100} tone={c.pct < 50 ? "bad" : c.pct < 80 ? "warn" : "ok"} />
                    </PanelRow>
                  ))}
                </PanelList>
              )}
            </Panel>
            <Panel title="Testers This Week" action={<TextLink href="/people">People</TextLink>}>
              {testers.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">No tester is booked over 100% this fortnight.</p>
              ) : (
                <PanelList>
                  <PanelRow
                    title={`${testers.length} ${testers.length === 1 ? "tester" : "testers"} booked over 100%`}
                    sub={testers
                      .slice(0, 3)
                      .map((t) => `${t.name} · ${t.pct}% across ${t.projects} ${t.projects === 1 ? "project" : "projects"}`)
                      .join(" · ")}
                    chip={<Chip tone="warn">Clash</Chip>}
                  />
                </PanelList>
              )}
            </Panel>
          </>
        }
      />
      <GateReviewDrawer target={review} onClose={() => setReview(null)} onDone={() => router.refresh()} timeZone={data.timeZone} />
    </main>
  );
}
