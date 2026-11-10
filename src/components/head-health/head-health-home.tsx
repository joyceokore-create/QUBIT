"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { KpiCard } from "@/components/ui/kpi-card";
import { useListUrl } from "@/components/list/use-list-url";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import { buildDecisions, DECISION_TAB_LABEL, DECISION_TABS, headKpis, pmLoad, type DecisionItem, type DecisionTab, type Tone } from "@/lib/head-health";
import { CARD, FOCUS, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX8 — Head › Delivery health (UX plan D3/D4/D5, UX8). Brief → four KPI cards → one
 * "Needs your decision" list (Gates · Disputes · Stale · Escalations) → PM load and
 * "Also waiting". Gate rows are labelled "Suggested from project signals": gates have no
 * approval workflow yet (WS1/UX13). The stage-gate tracker lives in Projects › Gate view.
 */

const TONE: Record<Tone, string> = { bad: "--bad-ink", warn: "--warn-ink", info: "--stage-exploring", muted: "--ink3" };
const COMPACT = `inline-flex h-[var(--control-h-compact)] items-center justify-center whitespace-nowrap rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] disabled:opacity-50 ${FOCUS}`;

function Chip({ tone, label }: { tone: Tone; label: string }) {
  const tok = TONE[tone];
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold" style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {label}
    </span>
  );
}

export interface AlsoWaiting {
  ideas: number | null;
  staffing: number | null;
  clashes: number;
}

export function HeadHealthHome({
  projects,
  pms,
  also,
  brief,
  nowIso,
  timeZone,
}: {
  projects: CockpitProject[];
  pms: { id: string; name: string }[];
  also: AlsoWaiting;
  brief: ReactNode;
  nowIso: string;
  timeZone: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const items = useMemo(() => buildDecisions(projects), [projects]);
  const k = headKpis(projects);
  const load = pmLoad(projects, pms);
  const list = useListUrl("head-health", 10);
  const counts = Object.fromEntries(DECISION_TABS.map((t) => [t, items.filter((i) => i.tab === t).length])) as Record<DecisionTab, number>;
  const raw = list.get("tab") as DecisionTab;
  // Open on the first tab that has something, so the Head lands on work, not an empty tab.
  const fallback = DECISION_TABS.find((t) => counts[t] > 0) ?? "gates";
  const tab: DecisionTab = DECISION_TABS.includes(raw) ? raw : fallback;
  const shown = items.filter((i) => i.tab === tab);

  const healthLine = [k.byHealth.ok && `${k.byHealth.ok} on track`, k.byHealth.warn && `${k.byHealth.warn} at risk`, k.byHealth.bad && `${k.byHealth.bad} off track`, k.byHealth.none && `${k.byHealth.none} not rated`]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink3)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now).replace(",", "")}</div>
          <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">Delivery health</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink3)]">What needs your decision across all projects this week.</p>
        </div>
        <Link href="/projects?view=gates" className={`inline-flex h-[var(--control-h)] items-center rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3.5 text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}>
          Gate view
        </Link>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Approved portfolio" value={k.approved} unit="projects" context={healthLine || "Nothing approved yet"} />
        <KpiCard label="Gates to watch" value={k.gates} context="Go-live gates in play · suggested from project signals" />
        <KpiCard label="Stale updates" value={k.stale} context="No check-in for 14+ days" />
        <KpiCard label="Status disputes" value={k.disputes} context="Reported greener than calculated" />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Needs your decision" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
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
            <Link href="/approvals" className={`mb-2 text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
              Open Approvals →
            </Link>
          </div>
          {tab === "gates" && (
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[12.5px] text-[var(--ink2)]">
              <b className="font-semibold text-[var(--qink)]">Suggested from project signals.</b> Gates have no approval step yet; these are projects whose go-live gate is in play.
            </p>
          )}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-[var(--qink)]">{EMPTY[tab]}</p>
              <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">A quiet week. Items appear here as projects drift, go quiet or need escalating.</p>
            </div>
          ) : (
            <ul>
              {shown.map((it) => (
                <DecisionRow key={it.id} it={it} />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">PM load</h2>
              <Link href="/people" className={`text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
                People →
              </Link>
            </div>
            {load.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink3)]">No project has a PM yet.</p>
            ) : (
              <ul>
                {load.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 first:border-0">
                    <span className="min-w-0">
                      <b className="block truncate text-[13px] font-semibold text-[var(--qink)]">{l.name}</b>
                      <span className="block text-[12px] text-[var(--ink3)]">
                        {l.projects} {l.projects === 1 ? "project" : "projects"}
                      </span>
                    </span>
                    {l.red ? <Chip tone="bad" label={`${l.red} off track`} /> : l.amber ? <Chip tone="warn" label={`${l.amber} at risk`} /> : <Chip tone="muted" label="All on track" />}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
            <h2 className="mb-1 text-[13.5px] font-semibold text-[var(--qink)]">Also waiting</h2>
            <ul>
              {also.ideas !== null && <AlsoRow href="/approvals?tab=ideas" label={`${also.ideas} ${also.ideas === 1 ? "idea" : "ideas"} to triage`} sub="Approvals › Ideas" />}
              {also.staffing !== null && <AlsoRow href="/approvals?tab=staffing" label={`${also.staffing} staffing ${also.staffing === 1 ? "request" : "requests"}`} sub="Approvals › Staffing" />}
              <AlsoRow href="/people" label={`${also.clashes} ${also.clashes === 1 ? "person" : "people"} booked over 100%`} sub="People › Workload" />
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

const EMPTY: Record<DecisionTab, string> = {
  gates: "No go-live gates in play",
  disputes: "No status disputes",
  stale: "Every project checked in within 14 days",
  escalations: "Nothing to escalate",
};

function AlsoRow({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <li className="border-t border-[var(--border)] py-2 first:border-0">
      <Link href={href} className={`block rounded-sm text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
        {label}
      </Link>
      <span className="block text-[12px] text-[var(--ink3)]">{sub}</span>
    </li>
  );
}

function DecisionRow({ it }: { it: DecisionItem }) {
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
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]">{it.title}</span>
        <span className="block truncate text-[12px] text-[var(--ink3)]">{it.sub}</span>
        <span className="mt-1 sm:hidden">
          <Chip tone={it.chip.tone} label={it.chip.label} />
        </span>
      </div>
      <span className="max-sm:hidden">
        <Chip tone={it.chip.tone} label={it.chip.label} />
      </span>
      {a.kind === "link" ? (
        <Link href={a.href} className={COMPACT}>
          {a.label}
        </Link>
      ) : (
        <button type="button" disabled={busy || done} onClick={() => nudge(a.projectId)} className={COMPACT}>
          {done ? "Reminded" : busy ? "Sending…" : a.label}
        </button>
      )}
    </li>
  );
}
