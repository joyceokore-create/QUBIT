"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { useListUrl } from "@/components/list/use-list-url";
import { buildQueue, coverageList, OPEN_CRITICAL_HREF, QH_TAB_LABEL, QH_TABS, qhKpis, type QhData, type QhTab, type Tone } from "@/lib/quality-home";
import { CARD, FOCUS, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX9 — Head of QA › Quality home (UX plan D3/D4, UX9). Brief → four KPI cards → one quality
 * queue (Testing gates · Critical issues · Unassigned test tasks · Overdue test tasks) →
 * requirement coverage and shortcuts. Signing off a testing gate in a drawer waits for the gate
 * workflow (WS1/UX13); until then a testing gate opens the project's Delivery tab, where Head of
 * QA can set testing gates (and only those, D10).
 */

const TONE: Record<Tone, string> = { bad: "--bad-ink", warn: "--warn-ink", info: "--stage-exploring", ok: "--ok-ink", muted: "--ink3" };
const COMPACT = `inline-flex h-[var(--control-h-compact)] items-center justify-center whitespace-nowrap rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`;
const LINK = `text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`;

function Chip({ tone, label }: { tone: Tone; label: string }) {
  const tok = TONE[tone];
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold" style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {label}
    </span>
  );
}

const EMPTY: Record<QhTab, string> = {
  gates: "No testing gates in play",
  critical: "No critical issues open",
  unassigned: "Every test task has someone on it",
  overdue: "No test tasks are overdue",
};

export function QualityHome({ data, brief, nowIso }: { data: QhData; brief: ReactNode; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const items = useMemo(() => buildQueue(data, now), [data, now]);
  const k = qhKpis(data);
  const coverage = coverageList(data);
  const list = useListUrl("quality-home", 10);
  const counts = Object.fromEntries(QH_TABS.map((t) => [t, items.filter((i) => i.tab === t).length])) as Record<QhTab, number>;
  const raw = list.get("tab") as QhTab;
  const tab: QhTab = QH_TABS.includes(raw) ? raw : (QH_TABS.find((t) => counts[t] > 0) ?? "gates");
  const shown = items.filter((i) => i.tab === tab);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink3)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: data.timeZone }).format(now).replace(",", "")}</div>
          <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">Quality home</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink3)]">Testing gates, critical issues and test coverage across delivery.</p>
        </div>
        <Link href="/reports?tab=quality" className={`inline-flex h-[var(--control-h)] items-center rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3.5 text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}>
          Quality report
        </Link>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Projects in testing" value={k.inTesting} context="At SIT or UAT" />
        <KpiCard label="Testing gates in play" value={k.testingGates} context={k.gatesBlocked ? `${k.gatesBlocked} blocked or held by critical issues` : "None blocked"} />
        <KpiCard label="Critical issues open" value={k.criticalOpen} context={k.criticalOpen ? `Across ${k.criticalProjects} ${k.criticalProjects === 1 ? "project" : "projects"}` : "None open"} />
        <KpiCard label="Test tasks overdue" value={k.overdueTests} context={k.overdueTests ? `Across ${k.overdueProjects} ${k.overdueProjects === 1 ? "project" : "projects"}` : "None overdue"} />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Quality queue" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
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
            <Link href="/projects?view=gates" className={`mb-2 ${LINK}`}>
              Gate view →
            </Link>
          </div>
          {tab === "gates" && (
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[12.5px] text-[var(--ink2)]">
              SIT and UAT gates in play. You set testing gates in each project&apos;s Delivery tab; signing off with a recorded exception arrives with the gate workflow.
            </p>
          )}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-[var(--qink)]">{EMPTY[tab]}</p>
              <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">Items appear here as projects reach testing, critical issues are raised, or test tasks slip.</p>
            </div>
          ) : (
            <ul>
              {shown.map((it) => (
                <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_110px_auto]">
                  <div className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]">{it.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ink3)]">{it.sub}</span>
                    <span className="mt-1 flex items-center gap-2 sm:hidden">
                      <Chip tone={it.chip.tone} label={it.chip.label} />
                      {it.when && <span className="text-[12px] text-[var(--ink2)]">{it.when}</span>}
                    </span>
                  </div>
                  <span className="max-sm:hidden">
                    <Chip tone={it.chip.tone} label={it.chip.label} />
                  </span>
                  <span className="truncate text-[12.5px] text-[var(--ink2)] max-sm:hidden">{it.when}</span>
                  <Link href={it.href} className={COMPACT}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Requirement coverage</h2>
              <Link href="/reports?tab=quality" className={LINK}>
                Report →
              </Link>
            </div>
            {coverage.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink3)]">No project tracks requirements yet. Coverage appears once requirements are linked to tasks.</p>
            ) : (
              <ul>
                {coverage.slice(0, 6).map((c) => {
                  const tok = c.pct < 50 ? "--bad-ink" : c.pct < 80 ? "--warn-ink" : "--ok-ink";
                  return (
                    <li key={c.id} className="border-t border-[var(--border)] py-2 first:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/projects/${c.id}`} className={`min-w-0 truncate text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                          {c.name}
                        </Link>
                        <span className="text-[12px] font-semibold tabular-nums" style={{ color: `var(${tok})` }}>
                          {c.pct}%
                        </span>
                      </div>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" aria-label={`${c.pct}% of requirements have tests`}>
                        <span className="block h-full rounded-full" style={{ width: `${c.pct}%`, background: `var(${tok})` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
            <h2 className="mb-1 text-[13.5px] font-semibold text-[var(--qink)]">Shortcuts</h2>
            <ul>
              <li className="py-1.5">
                <Link href={OPEN_CRITICAL_HREF} className={`text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  Open critical issues
                </Link>
                <span className="block text-[12px] text-[var(--ink3)]">Risks & Issues, filtered</span>
              </li>
              <li className="border-t border-[var(--border)] py-1.5">
                <Link href="/projects?view=gates" className={`text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  Every gate
                </Link>
                <span className="block text-[12px] text-[var(--ink3)]">Projects › Gate view</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
