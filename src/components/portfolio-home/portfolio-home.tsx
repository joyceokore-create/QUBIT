"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Meter, RagBar } from "@/components/ui/kpi-charts";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Columns, Foot, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Kv } from "@/components/ui/drawer";
import { PageHeader } from "@/components/list/page-header";
import { useListUrl } from "@/components/list/use-list-url";
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
  tabCounts,
  topRisks,
  type OneThing,
  type PortfolioHomeExtras,
  type PortfolioRow,
  type PriorityTab,
  type Tone,
} from "@/lib/portfolio-home";
import { GATE_KEYS, stageOf } from "@/lib/cockpit-gates";
import { dueChip } from "@/lib/decisions";
import { FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX10 + UX fidelity Tier 1 — Executive › Portfolio Home, built to design spec v2 (docs/08).
 * Brief → four KPI cards → the "Approved Portfolio" panel (tabs by priority; Project ·
 * Portfolio · Stage · Health · The One Thing to Know) → Blockers Needing a Decision (the real
 * list from Reports › This Week) and Top Risks. Read-only: a row opens the project drawer with a
 * link to the full workspace. WS2 (Tier 4): the decisions figure and the "Decisions Waiting on
 * the Group" panel are the real requests Heads and PMs raise (Decisions page); a project with
 * one waiting gets "Go to the Decision" in its summary drawer.
 */

const HOME_ROWS = 10;
const TONE_INK: Record<Tone, string> = { bad: "--ds-bad-text", warn: "--ds-warn-text", ok: "--ds-ok-text", muted: "--ds-ink2" };

function OneThingText({ it, className }: { it: OneThing; className?: string }) {
  return (
    <span className={cn("text-[12.5px]", it.tone === "bad" && "font-semibold", className)} style={{ color: `var(${TONE_INK[it.tone]})` }}>
      {it.text}
    </span>
  );
}

function Health({ r }: { r: CockpitProject["reported"] }) {
  return r === "N" ? <Chip>Not rated</Chip> : <HealthPill value={r} />;
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
  const risks = topRisks(projects, 3);
  const counts = tabCounts(rows);
  const list = useListUrl("portfolio-home", HOME_ROWS);
  const raw = list.get("tab") as PriorityTab;
  // Open on the first tab with projects, so the Executive lands on work, not an empty tab.
  const tab: PriorityTab = PRIORITY_TABS.includes(raw) ? raw : (PRIORITY_TABS.find((t) => counts[t] > 0) ?? "high");
  const inTab = rows.filter((r) => r.tab === tab);
  const shown = inTab.slice(0, HOME_ROWS);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (projects.find((p) => p.id === openId) ?? null) : null;
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now).replace(",", "");
  const waiting = extras.decisions;
  const overdue = waiting.dueDates.filter((d) => isOverdue(d, now, timeZone)).length;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={dateLine} title="Portfolio Home" description="How the approved portfolio is doing, and what is waiting on the Group." />

      {brief}

      <KpiRow count={4} label="Your numbers">
        <KpiCard
          label="Approved Portfolio"
          value={k.approved}
          unit={k.approved === 1 ? "project" : "projects"}
          context={healthLine(k.byHealth) || "Nothing approved yet"}
          chart={k.approved ? <RagBar ok={k.byHealth.ok} warn={k.byHealth.warn} bad={k.byHealth.bad} /> : undefined}
        />
        <KpiCard label="Live in Production" value={k.live} context={k.live ? k.liveNames.slice(0, 2).join(" · ") + (k.live > 2 ? ` and ${k.live - 2} more` : "") : "None live yet"} />
        <KpiCard
          label="Decisions Waiting on the Group"
          value={waiting.total}
          context={waiting.total === 0 ? "Nothing waiting" : overdue ? `${overdue} overdue` : "None overdue"}
          contextTone={overdue ? "bad" : "neutral"}
          chart={k.approved ? <Meter value={waiting.total} max={Math.max(k.approved, waiting.total)} tone="bad" /> : undefined}
        />
        <KpiCard
          label="Blocked by a Dependency"
          value={k.blocked}
          unit={k.blocked === 1 ? "project" : "projects"}
          context={k.blocked ? `${k.openBlockers} open ${k.openBlockers === 1 ? "blocker" : "blockers"}` : "No open blockers"}
          contextTone={k.blocked ? "bad" : "neutral"}
        />
      </KpiRow>

      <Columns
        main={
          <Panel title="Approved Portfolio" labelledBy="approved-portfolio" action={<TextLink href="/projects">{`All ${rows.length} Projects`}</TextLink>}>
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

            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
                <p className="text-[14px] font-semibold text-[var(--ds-ink)]">{rows.length === 0 ? "No approved projects yet" : `No ${PRIORITY_TAB_LABEL[tab].toLowerCase()}-priority projects`}</p>
                <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">Active projects in an Approved portfolio appear here, grouped by priority, with their health and the one thing to know.</p>
              </div>
            ) : (
              <>
                {/* Phones: one stacked row per project. */}
                <ul className="m-0 list-none p-0 sm:hidden">
                  {shown.map((r) => (
                    <li key={r.id} className="border-b border-dotted border-[var(--ds-line)] last:border-0">
                      <button type="button" onClick={() => setOpenId(r.id)} className={`flex w-full flex-col gap-1 px-1 py-2.5 text-left ${FOCUS}`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--ds-ink)]">{r.name}</span>
                          <Health r={r.reported} />
                        </span>
                        <span className="truncate text-[12px] text-[var(--ds-ink3)]">
                          {r.portfolio} · {r.stage}
                        </span>
                        <OneThingText it={r.oneThing} />
                      </button>
                    </li>
                  ))}
                </ul>
                {/* Tablet and up: the five-column table. */}
                <div className="overflow-x-auto max-sm:hidden">
                  <PortfolioTable rows={shown} onOpen={setOpenId} />
                </div>
              </>
            )}
            <Foot action={inTab.length > shown.length ? <TextLink href="/projects">Show All</TextLink> : undefined}>
              {inTab.length ? `Showing ${shown.length} of ${inTab.length}. Select a project for its summary.` : null}
            </Foot>
          </Panel>
        }
        rail={
          <>
            <Panel title="Decisions Waiting on the Group" action={<TextLink href="/decisions">{waiting.total > waiting.top.length ? `All ${waiting.total} Decisions` : "Decisions"}</TextLink>}>
              {waiting.top.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">Nothing is waiting on the Group.</p>
              ) : (
                <PanelList>
                  {waiting.top.map((d) => {
                    const chip = dueChip(d.dueDate, now, timeZone);
                    const late = chip.label === "Overdue";
                    return (
                      <PanelRow
                        key={d.id}
                        title={
                          <Link href={`/decisions?open=${d.id}`} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                            {d.title}
                          </Link>
                        }
                        sub={`${d.projectName ?? "Group level"} · ${d.dueDate ? `${late ? "was due" : "due"} ${formatDayMonth(d.dueDate, timeZone)}` : d.raisedBy}`}
                        chip={<Chip tone={chip.tone}>{chip.label}</Chip>}
                      />
                    );
                  })}
                </PanelList>
              )}
            </Panel>

            {extras.decisionBlockers && (
              <Panel title="Blockers Needing a Decision" action={<TextLink href="/reports">Reports</TextLink>}>
                {extras.decisionBlockers.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ds-ink3)]">Nothing is waiting on a decision this week.</p>
                ) : (
                  <PanelList>
                    {extras.decisionBlockers.map((d) => (
                      <PanelRow
                        key={d.id}
                        title={
                          <Link href={`/projects/${d.projectId}?tab=Register`} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                            {d.description}
                          </Link>
                        }
                        sub={`${d.projectName} · waiting ${d.ageDays} ${d.ageDays === 1 ? "day" : "days"}${d.severity === "Critical" ? " · critical" : ""}`}
                        chip={d.escalated ? <Chip tone="bad">Overdue</Chip> : d.ageDays >= 3 ? <Chip tone="warn">This week</Chip> : <Chip>New</Chip>}
                      />
                    ))}
                  </PanelList>
                )}
              </Panel>
            )}

            <Panel title="Top Risks" action={<TextLink href="/risks">Risks &amp; Issues</TextLink>}>
              {risks.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">No open red items.</p>
              ) : (
                <PanelList>
                  {risks.map((r) => (
                    <PanelRow
                      key={r.key}
                      title={
                        <Link href={`/projects/${r.projectId}?tab=Register`} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                          {r.title}
                        </Link>
                      }
                      sub={`${r.projectName} · ${r.owner && r.owner !== "—" ? `owner ${r.owner}` : "no owner"}`}
                      chip={<Chip tone="bad">Red risk</Chip>}
                    />
                  ))}
                </PanelList>
              )}
            </Panel>
          </>
        }
      />

      <Drawer open={!!open} onClose={() => setOpenId(null)}>
        {open && <ProjectSummary p={open} extras={extras} now={now} tz={timeZone} />}
      </Drawer>
    </main>
  );
}

function PortfolioTable({ rows, onOpen }: { rows: PortfolioRow[]; onOpen: (id: string) => void }) {
  return (
    <table className="w-full min-w-[680px] table-fixed border-separate border-spacing-0 text-left text-[12.5px]">
      <caption className="sr-only">Approved portfolio, worst health first. Select a project for its summary.</caption>
      <colgroup>
        <col className="w-[26%]" />
        <col className="w-[16%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
        <col />
      </colgroup>
      <thead className={THEAD}>
        <tr>
          <th scope="col">Project</th>
          <th scope="col">Portfolio</th>
          <th scope="col">Stage</th>
          <th scope="col">Health</th>
          <th scope="col">The One Thing to Know</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} className={cn(TROW, "cursor-pointer hover:[&>td]:bg-[var(--ds-surface2)]")}>
            <td>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(r.id);
                }}
                className={cn("block max-w-full truncate rounded-sm text-left font-semibold text-[var(--ds-ink)] hover:underline", FOCUS)}
              >
                {r.name}
              </button>
            </td>
            <td className="truncate text-[var(--ds-ink2)]">{r.portfolio}</td>
            <td className="truncate text-[var(--ds-ink2)]" title={`${r.stage} · ${r.phase}`}>
              {r.stage}
            </td>
            <td>
              <Health r={r.reported} />
            </td>
            <td>
              <OneThingText it={r.oneThing} className="line-clamp-2" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProjectSummary({ p, extras, now, tz }: { p: CockpitProject; extras: PortfolioHomeExtras; now: Date; tz: string }) {
  const thing = oneThingToKnow(p, now, tz);
  const { stage } = stageOf(p);
  const milestones = extras.nextMilestones[p.id] ?? [];
  const last = extras.lastLine[p.id];
  const gatesDone = GATE_KEYS.filter((g) => p.gates[g] === "done").length;
  const decisionId = extras.decisions.byProject[p.id] ?? null;
  const sub = [p.portfolioName ?? "Unassigned", stage, p.pmName ? `PM ${p.pmName}` : "No PM", `${priorityWord(p.priority)} priority`].join(" · ");
  return (
    <DrawerFrame
      header={<DrawerHeader step="Project" title={p.name} subtitle={sub} />}
      footer={
        <DrawerFooter>
          <Link href={`/projects/${p.id}`} className={decisionId ? SECONDARY : PRIMARY}>
            Open Full Workspace
          </Link>
          {decisionId && (
            <Link href={`/decisions?open=${decisionId}`} className={PRIMARY}>
              Go to the Decision
            </Link>
          )}
        </DrawerFooter>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-[var(--ds-ink3)]">
        <Health r={p.reported} />
        <span>{healthSentence(p)}</span>
      </div>
      <DrawerSection title="The One Thing to Know">
        <OneThingText it={thing} className="text-[13px]" />
      </DrawerSection>
      <Kv
        rows={[
          ["Progress", `${p.pct}%`],
          ["Gates", `${gatesDone} of ${GATE_KEYS.length} passed`],
          ["Target go-live", p.dueDate ? formatDate(p.dueDate, tz) : "Not set"],
          ["Open red risks", String(p.redRisks)],
        ]}
      />
      <DrawerSection title="Next Milestones">
        {milestones.length === 0 ? (
          <DrawerText hint>No upcoming milestones.</DrawerText>
        ) : (
          <ul className="m-0 flex list-disc flex-col gap-[5px] pl-[18px] text-[13px] text-[var(--ds-ink2)]">
            {milestones.map((m) => {
              const late = m.dueDate ? isOverdue(m.dueDate, now, tz) : false;
              return (
                <li key={m.id}>
                  {m.name} · {m.dueDate ? `${late ? "was " : ""}${formatDayMonth(m.dueDate, tz)}` : "no date"} {late && <Chip tone="bad">Late</Chip>}
                </li>
              );
            })}
          </ul>
        )}
      </DrawerSection>
      <DrawerSection title={last ? `Latest Check-In · Week ${last.isoWeek.split("-W")[1] ?? last.isoWeek}` : "Latest Check-In"}>
        {last ? (
          <>
            <DrawerText>“{last.line}”</DrawerText>
            <DrawerText hint>{last.confirmedAt ? `Confirmed ${formatDate(last.confirmedAt, tz)}` : "Not confirmed yet"}</DrawerText>
          </>
        ) : (
          <DrawerText hint>No confirmed check-in yet.</DrawerText>
        )}
      </DrawerSection>
    </DrawerFrame>
  );
}
