"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KpiCard } from "@/components/ui/kpi-card";
import { HealthPill } from "@/components/ui/status-pill";
import { TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { paginate } from "@/lib/list-state";
import { formatDate, formatDayMonth, isOverdue } from "@/lib/dates";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import {
  healthLine,
  healthSentence,
  oneThingToKnow,
  portfolioKpis,
  portfolioRows,
  PRIORITY_TAB_LABEL,
  PRIORITY_TABS,
  priorityWord,
  suggestedDecisions,
  SUGGESTED_LABEL,
  tabCounts,
  topRisks,
  type OneThing,
  type PortfolioHomeExtras,
  type PortfolioRow,
  type PriorityTab,
  type Tone,
} from "@/lib/portfolio-home";
import { stageOf } from "@/lib/cockpit-gates";
import { CARD, FOCUS, PRIMARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX10 — Executive › Portfolio home (UX plan D3/D4/D5, UX10). Brief → four KPI cards → one
 * "Approved portfolio" table (tabs by priority; Project · Portfolio · Stage · Health · The one
 * thing to know) → Blockers needing a decision (the real list from Reports › This week),
 * Suggested decisions and Top risks. Read-only: a row opens a project summary drawer with a
 * link to the full workspace. Suggested decisions are labelled "Suggested from project
 * signals" until the Decisions workflow exists (WS2/UX13).
 */

const TONE_INK: Record<Tone, string> = { bad: "--bad-ink", warn: "--warn-ink", ok: "--ok-ink", muted: "--ink2" };
const LINK = `text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`;
const H3 = "mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]";

function OneThingText({ it, className }: { it: OneThing; className?: string }) {
  return (
    <span className={cn("text-[12.5px]", it.tone === "bad" && "font-semibold", className)} style={{ color: `var(${TONE_INK[it.tone]})` }}>
      {it.text}
    </span>
  );
}

function Health({ r }: { r: CockpitProject["reported"] }) {
  return r === "N" ? <span className="text-[12px] text-[var(--ink3)]">Not rated</span> : <HealthPill value={r} />;
}

export function PortfolioHome({
  projects,
  extras,
  brief,
  nowIso,
  timeZone,
}: {
  projects: CockpitProject[];
  extras: PortfolioHomeExtras;
  brief: ReactNode;
  nowIso: string;
  timeZone: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const rows = useMemo(() => portfolioRows(projects, now, timeZone), [projects, now, timeZone]);
  const k = portfolioKpis(projects);
  const decisions = suggestedDecisions(projects, 3);
  const risks = topRisks(projects, 2);
  const counts = tabCounts(rows);
  const list = useListUrl("portfolio-home", 10);
  const raw = list.get("tab") as PriorityTab;
  // Open on the first tab with projects, so the Executive lands on work, not an empty tab.
  const tab: PriorityTab = PRIORITY_TABS.includes(raw) ? raw : (PRIORITY_TABS.find((t) => counts[t] > 0) ?? "high");
  const inTab = rows.filter((r) => r.tab === tab);
  const page = paginate(inTab, list.page, list.size);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? projects.find((p) => p.id === openId) ?? null : null;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink3)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now).replace(",", "")}</div>
          <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">Portfolio home</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink3)]">How the approved portfolio is doing, and what is waiting on the Group.</p>
        </div>
        <Link href="/reports" className={`inline-flex h-[var(--control-h)] items-center rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3.5 text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}>
          This week&apos;s report
        </Link>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Approved portfolio" value={k.approved} unit={k.approved === 1 ? "project" : "projects"} context={healthLine(k.byHealth) || "Nothing approved yet"} />
        <KpiCard label="Live in production" value={k.live} context={k.live ? k.liveNames.slice(0, 2).join(" · ") + (k.live > 2 ? ` and ${k.live - 2} more` : "") : "None live yet"} />
        <KpiCard label="Decisions waiting on the Group" value={k.decisions} context={SUGGESTED_LABEL} />
        <KpiCard
          label="Blocked by a dependency"
          value={k.blocked}
          unit={k.blocked === 1 ? "project" : "projects"}
          context={k.blocked ? `${k.openBlockers} open ${k.openBlockers === 1 ? "blocker" : "blockers"}` : "No open blockers"}
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="approved-portfolio" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
          <h2 id="approved-portfolio" className="sr-only">
            Approved portfolio
          </h2>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
            <nav aria-label="Priority">
              <ul className={TABS_ROW}>
                {PRIORITY_TABS.map((t) => (
                  <li key={t}>
                    <button type="button" aria-current={t === tab ? "page" : undefined} onClick={() => list.set({ tab: t })} className={cn(TAB, t === tab && TAB_ACTIVE_ON_CARD)}>
                      {PRIORITY_TAB_LABEL[t]}
                      <span className={TAB_COUNT}>{counts[t]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href="/portfolios" className={`mb-2 ${LINK}`}>
              Portfolios →
            </Link>
          </div>

          {page.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-[var(--qink)]">{rows.length === 0 ? "No approved projects yet" : `No ${PRIORITY_TAB_LABEL[tab].toLowerCase()}-priority projects`}</p>
              <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">Active projects in an Approved portfolio appear here, grouped by priority, with their health and the one thing to know.</p>
            </div>
          ) : (
            <>
              {/* Phones: one stacked row per project. */}
              <ul className="sm:hidden">
                {page.rows.map((r) => (
                  <li key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <button type="button" onClick={() => setOpenId(r.id)} className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-[var(--surface-2)] ${FOCUS}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--qink)]">{r.name}</span>
                        <Health r={r.reported} />
                      </span>
                      <span className="truncate text-[12px] text-[var(--ink3)]">
                        {r.portfolio} · {r.stage}
                      </span>
                      <OneThingText it={r.oneThing} />
                    </button>
                  </li>
                ))}
              </ul>
              {/* Tablet and up: the five-column table. */}
              <div className="overflow-x-auto max-sm:hidden">
                <PortfolioTable rows={page.rows} onOpen={setOpenId} />
              </div>
            </>
          )}
          <TableFooter info={page.info} noun="projects" onPage={list.setPage} onSize={list.setSize} />
        </section>

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          {extras.decisionBlockers && (
            <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }} aria-labelledby="ph-blockers">
              <div className="mb-1 flex items-center justify-between">
                <h2 id="ph-blockers" className="text-[13.5px] font-semibold text-[var(--qink)]">
                  Blockers needing a decision
                </h2>
                <Link href="/reports" className={LINK}>
                  This week →
                </Link>
              </div>
              {extras.decisionBlockers.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink3)]">Nothing is waiting on a decision this week.</p>
              ) : (
                <ul>
                  {extras.decisionBlockers.map((d) => (
                    <li key={d.id} className="border-t border-[var(--border)] py-2 first:border-0">
                      <Link href={`/projects/${d.projectId}?tab=Register`} className={`block rounded-sm text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                        {d.description}
                      </Link>
                      <span className="block truncate text-[12px] text-[var(--ink3)]">
                        {d.projectName} ·{" "}
                        <b className="font-semibold" style={d.escalated ? { color: "var(--bad-ink)" } : undefined}>
                          {d.ageDays} {d.ageDays === 1 ? "day" : "days"}
                        </b>
                        {d.severity === "Critical" && " · Critical"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }} aria-labelledby="ph-suggested">
            <h2 id="ph-suggested" className="text-[13.5px] font-semibold text-[var(--qink)]">
              Suggested decisions
            </h2>
            <p className="mb-1 text-[12px] text-[var(--ink3)]">{SUGGESTED_LABEL}, not raised by people.</p>
            {decisions.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink3)]">No project signals point to a Group decision.</p>
            ) : (
              <ul>
                {decisions.map((d) => (
                  <li key={d.projectId} className="border-t border-[var(--border)] py-2 first:border-0">
                    <Link href={d.href} className={`block truncate rounded-sm text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                      {d.projectName}
                    </Link>
                    <span className="block text-[12px] text-[var(--ink2)]">{d.why}</span>
                    <span className="block truncate text-[12px] text-[var(--ink3)]">
                      {d.owner} · {d.waiting}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }} aria-labelledby="ph-risks">
            <div className="mb-1 flex items-center justify-between">
              <h2 id="ph-risks" className="text-[13.5px] font-semibold text-[var(--qink)]">
                Top risks
              </h2>
              <Link href="/risks" className={LINK}>
                Risks & Issues →
              </Link>
            </div>
            {risks.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink3)]">No open red items.</p>
            ) : (
              <ul>
                {risks.map((r) => (
                  <li key={r.key} className="border-t border-[var(--border)] py-2 first:border-0">
                    <Link href={`/projects/${r.projectId}?tab=Register`} className={`block rounded-sm text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                      {r.title}
                    </Link>
                    <span className="block truncate text-[12px] text-[var(--ink3)]">
                      {r.projectName} · {r.owner && r.owner !== "—" ? `owner ${r.owner}` : "No owner"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
          {open && <ProjectSummary p={open} extras={extras} now={now} tz={timeZone} />}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function PortfolioTable({ rows, onOpen }: { rows: PortfolioRow[]; onOpen: (id: string) => void }) {
  return (
    <table className="w-full min-w-[680px] table-fixed text-left text-[13px]">
      <caption className="sr-only">Approved portfolio, worst health first. Select a project for its summary.</caption>
      <colgroup>
        <col className="w-[26%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[13%]" />
        <col />
      </colgroup>
      <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
        <tr>
          <th scope="col" className="px-4 py-2.5 font-semibold">Project</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Portfolio</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Health</th>
          <th scope="col" className="px-4 py-2.5 font-semibold">The one thing to know</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
            <td className="px-4 py-2.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(r.id);
                }}
                className="block max-w-full truncate rounded-sm text-left font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                {r.name}
              </button>
              <span className="block truncate font-mono text-[11.5px] text-[var(--ink3)]">{r.code}</span>
            </td>
            <td className="truncate px-3 py-2.5 text-[var(--ink2)]">{r.portfolio}</td>
            <td className="truncate px-3 py-2.5 text-[var(--ink2)]" title={`${r.stage} · ${r.phase}`}>
              {r.stage}
            </td>
            <td className="px-3 py-2.5">
              <Health r={r.reported} />
            </td>
            <td className="px-4 py-2.5">
              <OneThingText it={r.oneThing} className="line-clamp-2" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] py-2 first:border-0">
      <dt className="text-[12.5px] text-[var(--ink3)]">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-semibold text-[var(--qink)]">{children}</dd>
    </div>
  );
}

function ProjectSummary({ p, extras, now, tz }: { p: CockpitProject; extras: PortfolioHomeExtras; now: Date; tz: string }) {
  const thing = oneThingToKnow(p, now, tz);
  const { stage } = stageOf(p);
  const milestones = extras.nextMilestones[p.id] ?? [];
  const last = extras.lastLine[p.id];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
        <div className="text-[11.5px] font-semibold text-[var(--ink3)]">Project summary</div>
        <SheetTitle className="mt-0.5 text-[17px] font-bold text-[var(--qink)]">{p.name}</SheetTitle>
        <SheetDescription className="mt-0.5 text-[12.5px] text-[var(--ink3)]">
          {p.code} · {p.portfolioName ?? "Unassigned"} · {stage}
        </SheetDescription>
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className={H3}>Health</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Health r={p.reported} />
            <span className="text-[13px] text-[var(--ink2)]">{healthSentence(p)}</span>
          </div>
        </section>
        <section>
          <h3 className={H3}>The one thing to know</h3>
          <OneThingText it={thing} className="text-[13.5px]" />
        </section>
        <section>
          <h3 className={H3}>Next milestones</h3>
          {milestones.length === 0 ? (
            <p className="text-[13px] text-[var(--ink3)]">No upcoming milestones.</p>
          ) : (
            <ul>
              {milestones.map((m) => {
                const late = m.dueDate ? isOverdue(m.dueDate, now, tz) : false;
                return (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] py-1.5 first:border-0">
                    <span className="min-w-0 truncate text-[13px] text-[var(--qink)]">{m.name}</span>
                    <span className={cn("whitespace-nowrap text-[12.5px] tabular-nums", late ? "font-semibold text-[var(--bad-ink)]" : "text-[var(--ink2)]")}>
                      {m.dueDate ? `${late ? "Overdue · " : ""}${formatDayMonth(m.dueDate, tz)}` : "No date"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section>
          <h3 className={H3}>Latest confirmed check-in</h3>
          {last ? (
            <>
              <p className="text-[13px] text-[var(--qink)]">“{last.line}”</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink3)]">{last.confirmedAt ? `Confirmed ${formatDate(last.confirmedAt, tz)}` : `Week ${last.isoWeek}`}</p>
            </>
          ) : (
            <p className="text-[13px] text-[var(--ink3)]">No confirmed check-in yet.</p>
          )}
        </section>
        <section>
          <h3 className={H3}>Facts</h3>
          <dl>
            <Fact label="PM">{p.pmName ?? "No PM"}</Fact>
            <Fact label="Priority">{priorityWord(p.priority)}</Fact>
            <Fact label="Progress">
              <span className="inline-flex items-center gap-2">
                <span className="h-1 w-[80px] overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                  <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${p.pct}%` }} />
                </span>
                <span className="tabular-nums">{p.pct}%</span>
              </span>
            </Fact>
            <Fact label="Target date">{p.dueDate ? formatDate(p.dueDate, tz) : "Not set"}</Fact>
          </dl>
        </section>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <Link href={`/projects/${p.id}`} className={PRIMARY}>
          Open full workspace
        </Link>
      </div>
    </div>
  );
}
