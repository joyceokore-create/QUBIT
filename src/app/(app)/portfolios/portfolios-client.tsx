"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { Button } from "@/components/ui/button";
import { HealthPill, StagePill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { LifecycleCards } from "@/components/portfolios/lifecycle-cards";
import { NewIdeaDialog } from "@/app/(app)/ideas/ideas-client";
import { matchesSearch, paginate } from "@/lib/list-state";
import { HEALTH_LABEL, HEALTH_ORDER } from "@/lib/project-gate-view";
import { TAB, TAB_ACTIVE, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";
import {
  INITIATIVE_TABS,
  TAB_LABEL,
  daysInStage,
  inactiveLine,
  isStuck,
  lifecycleCards,
  parseTab,
  rowsForTab,
  sortInitiatives,
  tabCounts,
  tabStages,
  type InitiativeRow,
  type StageHistory,
} from "@/lib/initiatives";

// UX10 (UX plan D8a/D8b) — Portfolios: initiatives through their lifecycle. The five cards
// sit on top and never change with the tab or filters; one line under them counts the
// paused, shelved or cancelled ones (cards + Inactive = All). Then the list-page kit: tabs
// All · Pipeline · Delivery · Inactive, toolbar (search + Sponsor, Priority, Stage, Health,
// chips, "Clear all" last), and the table card with always-visible pagination. A tenant has
// a bounded set of initiatives, so it loads once and pages in the browser; all view state
// lives in the URL.

const FILTER_KEYS = ["sponsor", "priority", "stage", "health"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { sponsor: "Sponsor", priority: "Priority", stage: "Stage", health: "Health" };
const NONE = "__none";
const PRIORITY_ORDER = ["Strat", "High", "Med", "Low", "New", "Paused"];

const valueOptions = (values: (string | null)[], noneLabel: string, order?: string[]): FilterOption[] => {
  const rank = (v: string) => (order ? (order.indexOf(v) === -1 ? order.length : order.indexOf(v)) : 0);
  const set = [...new Set(values.map((v) => v ?? NONE))].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : rank(a) - rank(b) || a.localeCompare(b)));
  return set.map((v) => ({ value: v, label: v === NONE ? noneLabel : v }));
};

const PILL_NEUTRAL = "inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-[var(--border)] px-2 text-[12px] font-semibold text-[var(--ink3)]";

export function PortfoliosClient({
  tenantName,
  rows: all,
  history,
  nowIso,
  timeZone,
  portfolios,
  can,
}: {
  tenantName: string;
  rows: InitiativeRow[];
  history: StageHistory;
  nowIso: string;
  timeZone: string;
  portfolios: { id: string; name: string }[];
  can: { idea: boolean; project: boolean; portfolio: boolean };
}) {
  const router = useRouter();
  const { openProject } = usePanel();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const list = useListUrl("portfolios", 10);

  const cards = useMemo(() => lifecycleCards(all, now, timeZone, history), [all, now, timeZone, history]);
  const inactiveCount = useMemo(() => rowsForTab(all, "inactive").length, [all]);

  const tab = parseTab(list.get("tab"));
  const healthOpt = (r: InitiativeRow) => r.health ?? "";

  const opts = useMemo<Record<FilterKey, FilterOption[]>>(() => {
    const inTab = rowsForTab(all, tab);
    return {
      sponsor: valueOptions(all.map((r) => r.sponsor), "No sponsor set"),
      priority: valueOptions(all.map((r) => r.priority), "No priority (ideas)", PRIORITY_ORDER),
      stage: tabStages(tab)
        .filter((s) => inTab.some((r) => r.stage === s))
        .map((s) => ({ value: s, label: s })),
      health: HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h] })),
    };
  }, [all, tab]);
  // Only allow-listed values reach the filter; an odd URL reads as "all".
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, opts[k].some((o) => o.value === list.get(k)) ? list.get(k) : ""])) as Record<FilterKey, string>;

  const eq = (value: string | null, filter: string) => !filter || (value ?? NONE) === filter;
  // Search + filters first; the tab counts follow them, then the tab picks its slice.
  const filtered = useMemo(
    () =>
      all.filter(
        (r) =>
          matchesSearch(list.q, r.name, r.code, r.sponsor, r.portfolio?.name) &&
          eq(r.sponsor, f.sponsor) &&
          eq(r.priority, f.priority) &&
          (!f.stage || r.stage === f.stage) &&
          (!f.health || healthOpt(r) === f.health),
      ),
    [all, list.q, f.sponsor, f.priority, f.stage, f.health],
  );
  const counts = tabCounts(filtered);
  const shown = useMemo(() => sortInitiatives(rowsForTab(filtered, tab), now, timeZone), [filtered, tab, now, timeZone]);
  const { rows, info } = paginate(shown, list.page, list.size);

  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === f[k])?.label ?? f[k]}`,
  }));
  const isFiltered = active.length > 0 || !!list.q;
  const clearAll = () => list.clear([...FILTER_KEYS]);

  // One filled primary: New project when allowed, else New idea.
  const primary = can.project ? "project" : can.idea ? "idea" : can.portfolio ? "portfolio" : null;
  const variant = (k: "project" | "idea" | "portfolio") => (primary === k ? "default" : "outline");

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={tenantName}
        title="Portfolios"
        description={`${all.length} ${all.length === 1 ? "initiative" : "initiatives"}, from idea to live. Health is this week's confirmed check-in.`}
        actions={
          <>
            {can.portfolio && (
              <Button variant={variant("portfolio")} nativeButton={false} render={<Link href="/portfolios/new" />}>
                <Plus /> New portfolio
              </Button>
            )}
            {can.idea && (
              <Button variant={variant("idea")} onClick={() => setIdeaOpen(true)}>
                <Plus /> New idea
              </Button>
            )}
            {can.project && (
              <Button variant={variant("project")} nativeButton={false} render={<Link href="/projects/new" />}>
                <Plus /> New project
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2">
        <LifecycleCards cards={cards} />
        <p className="text-[12.5px] text-[var(--ink3)]">
          {inactiveLine(inactiveCount)}
          {inactiveCount > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => list.set({ tab: "inactive" })}
                className="rounded-sm font-semibold text-[var(--qink)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                View
              </button>
            </>
          )}
        </p>
      </div>

      <nav aria-label="Initiative views">
        <ul className={TABS_ROW}>
          {INITIATIVE_TABS.map((t) => (
            <li key={t}>
              <button
                type="button"
                aria-current={t === tab ? "page" : undefined}
                // A stage filter from another tab would hide everything; drop it on switch.
                onClick={() => list.set({ tab: t === "all" ? null : t, stage: null })}
                className={cn(TAB, t === tab && TAB_ACTIVE)}
              >
                {TAB_LABEL[t]}
                <span className={TAB_COUNT}>{counts[t]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search initiatives, codes, sponsors or portfolios" label="Search initiatives" className="sm:w-[320px]" />
          <FilterSelect label="Sponsor" allLabel="All sponsors" value={f.sponsor} options={opts.sponsor} onChange={(v) => list.set({ sponsor: v })} />
          <FilterSelect label="Priority" allLabel="All priorities" value={f.priority} options={opts.priority} onChange={(v) => list.set({ priority: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Health" allLabel="All health" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={clearAll} />
        </ListToolbar>
      </div>

      <TableCard footer={<TableFooter info={info} noun="initiatives" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun={tab === "inactive" ? "inactive initiatives" : "initiatives"}
            onClear={clearAll}
            hint={f.health ? "Ideas, live and inactive projects carry no health, so the Health filter hides them." : undefined}
          />
        ) : (
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Initiative</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Portfolio</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Health</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Sponsor</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Days in stage</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Priority</th>
                <th scope="col" className="w-8 px-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysInStage(r.stageEnteredAt, now, timeZone);
                const stuck = isStuck(r, now, timeZone);
                const ideaHref = `/ideas?q=${encodeURIComponent(r.name)}`;
                const open = () => (r.kind === "project" ? openProject(r.id) : router.push(ideaHref));
                return (
                  <tr key={`${r.kind}:${r.id}`} onClick={open} className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="max-w-[320px] px-4 py-2.5">
                      {r.kind === "project" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProject(r.id);
                          }}
                          className="block max-w-full truncate rounded-sm text-left font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                        >
                          {r.name}
                        </button>
                      ) : (
                        <Link
                          href={ideaHref}
                          onClick={(e) => e.stopPropagation()}
                          className="block max-w-full truncate rounded-sm font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                        >
                          {r.name}
                        </Link>
                      )}
                      <span className="block truncate text-[12px] text-[var(--ink3)]">{r.kind === "project" ? <span className="font-mono text-[11.5px]">{r.code}</span> : "Idea"}</span>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      {r.portfolio ? (
                        <Link
                          href={`/portfolios/${r.portfolio.id}`}
                          onClick={(e) => e.stopPropagation()}
                          title={r.kind === "idea" ? "Suggested portfolio" : undefined}
                          className="block max-w-full truncate rounded-sm text-[var(--ink2)] outline-none hover:text-[var(--qink)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                        >
                          {r.portfolio.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--ink3)]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {r.stage === "Inactive" ? <span className={PILL_NEUTRAL}>{r.inactiveReason ?? "Inactive"}</span> : <StagePill stage={r.stage} />}
                        {stuck && (
                          <span
                            title="In this stage for more than 30 days"
                            className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold text-[var(--warn-ink)]"
                            style={{ background: "color-mix(in oklab, var(--warn-ink) 12%, transparent)" }}
                          >
                            Stuck
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {r.health === null ? (
                        <span className="text-[var(--ink3)]">—</span>
                      ) : r.health === "None" ? (
                        <span className="text-[12px] font-semibold text-[var(--ink3)]" title="No confirmed weekly report yet">No report</span>
                      ) : (
                        <HealthPill value={r.health} />
                      )}
                    </td>
                    <td className="max-w-[180px] truncate whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{r.sponsor ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--ink2)]" title={days === null ? "Stage entry date not known" : undefined}>
                      {days ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{r.priority ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      <ChevronRight className="size-4 text-[var(--ink3)]" aria-hidden />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {can.idea && <NewIdeaDialog open={ideaOpen} onOpenChange={setIdeaOpen} portfolios={portfolios} onSubmitted={async () => router.refresh()} />}
    </main>
  );
}
