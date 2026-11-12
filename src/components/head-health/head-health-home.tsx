"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Meter, RagBar } from "@/components/ui/kpi-charts";
import { Chip } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Columns, Foot, ListRow, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { GateReviewDrawer, type GateTarget } from "@/components/gates/gate-review";
import type { GateQueueItem } from "@/lib/gate-approval";
import { PageHeader } from "@/components/list/page-header";
import { useListUrl } from "@/components/list/use-list-url";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import { buildDecisions, DECISION_TAB_LABEL, DECISION_TABS, headKpis, pmLoad, waitingDays, type DecisionItem, type DecisionTab } from "@/lib/head-health";
import { COMPACT, FOCUS, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { SuggestRaisingPanel } from "@/components/decisions/suggest-raising-panel";

/**
 * UX8 + UX fidelity Tier 1 — Head › Delivery Health, built to design spec v2 (docs/08). Brief →
 * four KPI cards → the "Needs Your Decision" panel (Gates · Disputes · Stale · Escalations) →
 * PM Load and Also Waiting. WS1 (Tier 4): the Gates tab and the "Gates Waiting on You" KPI
 * list real gates submitted for sign-off; Review opens the review drawer (13 / 14) here. The
 * stage-gate tracker lives in Projects › Gate View.
 */

export interface AlsoWaiting {
  ideas: number | null;
  staffing: number | null;
  clashes: number;
}

export function HeadHealthHome({
  projects,
  gates = [],
  pms,
  also,
  brief,
  nowIso,
  timeZone,
}: {
  projects: CockpitProject[];
  /** WS1 — gates waiting on this Head's sign-off (approver lens). */
  gates?: GateQueueItem[];
  pms: { id: string; name: string }[];
  also: AlsoWaiting;
  brief: ReactNode;
  nowIso: string;
  timeZone: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const router = useRouter();
  const [review, setReview] = useState<GateTarget | null>(null);
  const items = useMemo(() => buildDecisions(projects, gates, now, timeZone), [projects, gates, now, timeZone]);
  const k = headKpis(projects, gates);
  const oldest = gates.find((g) => g.approval === "submitted");
  const oldestDays = oldest ? waitingDays(oldest.submittedAt, now, timeZone) : 0;
  const load = pmLoad(projects, pms);
  const list = useListUrl("head-health", 10);
  const counts = Object.fromEntries(DECISION_TABS.map((t) => [t, items.filter((i) => i.tab === t).length])) as Record<DecisionTab, number>;
  const raw = list.get("tab") as DecisionTab;
  // Open on the first tab that has something, so the Head lands on work, not an empty tab.
  const fallback = DECISION_TABS.find((t) => counts[t] > 0) ?? "gates";
  const tab: DecisionTab = DECISION_TABS.includes(raw) ? raw : fallback;
  const shown = items.filter((i) => i.tab === tab);
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now).replace(",", "");

  const healthLine = [k.byHealth.ok && `${k.byHealth.ok} on track`, k.byHealth.warn && `${k.byHealth.warn} at risk`, k.byHealth.bad && `${k.byHealth.bad} off track`, k.byHealth.none && `${k.byHealth.none} not rated`]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={dateLine} title="Delivery Health" description="What needs your decision across all projects this week." />

      {brief}

      <KpiRow count={4} label="Your numbers">
        <KpiCard
          label="Approved Portfolio"
          value={k.approved}
          unit="projects"
          context={healthLine || "Nothing approved yet"}
          chart={k.approved ? <RagBar ok={k.byHealth.ok} warn={k.byHealth.warn} bad={k.byHealth.bad} /> : undefined}
        />
        <KpiCard
          label="Gates Waiting on You"
          value={k.gates}
          context={k.gates ? `Oldest: ${oldestDays === 0 ? "today" : oldestDays === 1 ? "1 day" : `${oldestDays} days`}` : "None waiting"}
          contextTone={oldestDays >= 3 ? "bad" : "neutral"}
        />
        <KpiCard
          label="Stale Updates"
          value={k.stale}
          context="No check-in for 14+ days"
          contextTone={k.stale ? "bad" : "neutral"}
          chart={k.approved ? <Meter value={k.stale} max={k.approved} tone="warn" /> : undefined}
        />
        <KpiCard label="Status Disputes" value={k.disputes} context="Reported greener than calculated" />
      </KpiRow>

      <Columns
        main={
          <Panel title="Needs Your Decision" labelledBy="head-decisions" action={<TextLink href="/approvals">Open Approvals</TextLink>}>
            <nav aria-label="Decision views">
              <ul className={TABS_ROW}>
                {DECISION_TABS.map((t) => (
                  <li key={t}>
                    <button type="button" aria-current={t === tab ? "page" : undefined} onClick={() => list.set({ tab: t })} className={cn(TAB, t === tab && TAB_ACTIVE_ON_CARD)}>
                      {DECISION_TAB_LABEL[t]}
                      <span className={TAB_COUNT}>{counts[t]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
                <p className="text-[14px] font-semibold text-[var(--ds-ink)]">{EMPTY[tab]}</p>
                <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">A quiet week. Items appear here as projects drift, go quiet or need escalating.</p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((it) => (
                  <DecisionRow key={it.id} it={it} onReview={setReview} />
                ))}
              </ul>
            )}
            <Foot>{tab === "gates" ? "Gates submitted for sign-off by PMs and status uploads. Review opens the gate here." : "Each action opens where the work is done."}</Foot>
          </Panel>
        }
        rail={
          <>
            <Panel title="PM Load" action={<TextLink href="/people">People</TextLink>}>
              {load.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">No project has a PM yet.</p>
              ) : (
                <PanelList>
                  {load.slice(0, 6).map((l) => (
                    <PanelRow
                      key={l.id}
                      title={l.name}
                      sub={`${l.projects} ${l.projects === 1 ? "project" : "projects"}${l.red || l.amber ? "" : " · all on track"}`}
                      chip={l.red ? <Chip tone="bad">{l.red} off track</Chip> : l.amber ? <Chip tone="warn">{l.amber} at risk</Chip> : <Chip tone="ok">On track</Chip>}
                    />
                  ))}
                </PanelList>
              )}
            </Panel>
            <Panel title="Also Waiting">
              <PanelList>
                {also.ideas !== null && <AlsoRow href="/approvals?tab=ideas" label={`${also.ideas} ${also.ideas === 1 ? "idea" : "ideas"} to triage`} sub="Approvals › Ideas" chip={<Chip tone="info">Ideas</Chip>} />}
                {also.staffing !== null && (
                  <AlsoRow href="/approvals?tab=staffing" label={`${also.staffing} staffing ${also.staffing === 1 ? "request" : "requests"}`} sub="Approvals › Staffing" chip={<Chip tone="info">People</Chip>} />
                )}
                <AlsoRow
                  href="/people"
                  label={`${also.clashes} resource ${also.clashes === 1 ? "clash" : "clashes"} this week`}
                  sub="People › Workload"
                  chip={also.clashes ? <Chip tone="warn">Clash</Chip> : <Chip tone="ok">All clear</Chip>}
                />
              </PanelList>
            </Panel>
            {/* WS2: project signals are hints to raise a decision, not decisions. */}
            <SuggestRaisingPanel projects={projects} />
          </>
        }
      />
      <GateReviewDrawer target={review} onClose={() => setReview(null)} onDone={() => router.refresh()} timeZone={timeZone} />
    </main>
  );
}

const EMPTY: Record<DecisionTab, string> = {
  gates: "No gates waiting for your sign-off",
  disputes: "No status disputes",
  stale: "Every project checked in within 14 days",
  escalations: "Nothing to escalate",
};

function AlsoRow({ href, label, sub, chip }: { href: string; label: string; sub: string; chip: ReactNode }) {
  return (
    <PanelRow
      title={
        <Link href={href} className={cn("rounded-[3px] hover:underline", FOCUS)}>
          {label}
        </Link>
      }
      sub={sub}
      chip={chip}
    />
  );
}

function DecisionRow({ it, onReview }: { it: DecisionItem; onReview: (t: GateTarget) => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function nudge(projectId: string) {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/checkin/nudge`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      toast.error(body?.error?.message ?? "Couldn't send the reminder. Try again.");
      return;
    }
    const body = (await res.json().catch(() => null)) as { data?: { targeted?: number } } | null;
    setDone(true);
    toast.success(body?.data?.targeted === 0 ? "This week's update is already in." : "Reminder sent to the PM.");
  }

  const a = it.action;
  const action =
    a.kind === "gate" ? (
      <button type="button" onClick={() => onReview({ projectId: a.projectId, statusId: a.statusId })} className={COMPACT}>
        {a.label}
      </button>
    ) : a.kind === "link" ? (
      <Link href={a.href} className={COMPACT}>
        {a.label}
      </Link>
    ) : (
      <button type="button" disabled={busy || done} onClick={() => nudge(a.projectId)} className={COMPACT}>
        {done ? "Reminded" : busy ? "Sending…" : a.label}
      </button>
    );
  return <ListRow title={it.title} sub={it.sub} chip={<Chip tone={it.chip.tone}>{it.chip.label}</Chip>} meta={it.when} action={action} />;
}
