"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { Chip, HealthPill, StagePill } from "@/components/ui/status-pill";
import { TextButton } from "@/components/ui/text-link";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { LifecycleCards } from "@/components/portfolios/lifecycle-cards";
import { NewIdeaDialog } from "@/app/(app)/ideas/ideas-client";
import { matchesSearch, paginate } from "@/lib/list-state";
import { HEALTH_LABEL, HEALTH_ORDER } from "@/lib/project-gate-view";
import { FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE, TAB_COUNT, TABS_ROW, THEAD, TROW } from "@/lib/surface";
import { formatDayMonth } from "@/lib/dates";
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

const PILL_NEUTRAL = "inline-flex items-center whitespace-nowrap rounded-full bg-[var(--ds-mutedw)] px-2 py-0.5 text-[11px] font-semibold leading-[1.5] text-[var(--ds-ink2)]";

export function PortfoliosClient({
  tenantName: _tenantName,
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


  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        title="Portfolios"
        description="Every initiative, from first idea to live."
        actions={
          <>
            <a href="/api/export?kind=projects" className={SECONDARY}>
              Export CSV
            </a>
            {can.portfolio && (
              <Link href="/portfolios/new" className={SECONDARY}>
                <Plus className="size-3.5" aria-hidden /> New Portfolio
              </Link>
            )}
            {can.project && (
              <Link href="/projects/new" className={can.idea ? SECONDARY : PRIMARY}>
                <Plus className="size-3.5" aria-hidden /> New Project
              </Link>
            )}
            {can.idea && (
              <button type="button" onClick={() => setIdeaOpen(true)} className={PRIMARY}>
                <Plus className="size-3.5" aria-hidden /> New Idea
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2">
        <LifecycleCards cards={cards} />
        <p className="flex items-center gap-2 text-[12.5px] text-[var(--ds-ink3)]">
          {inactiveLine(inactiveCount)}
          {inactiveCount > 0 && (
            <TextButton arrow onClick={() => list.set({ tab: "inactive" })}>
              View
            </TextButton>
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
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search initiatives or sponsors" label="Search initiatives" />
          <FilterSelect label="Sponsor" allLabel="All sponsors" value={f.sponsor} options={opts.sponsor} onChange={(v) => list.set({ sponsor: v })} />
          <FilterSelect label="Priority" allLabel="All priorities" value={f.priority} options={opts.priority} onChange={(v) => list.set({ priority: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Health" allLabel="All statuses" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
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
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col">Initiative</th>
                <th scope="col">Sponsor</th>
                <th scope="col">Stage</th>
                <th scope="col">Health</th>
                <th scope="col">Next Step</th>
                <th scope="col">In Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysInStage(r.stageEnteredAt, now, timeZone);
                const stuck = isStuck(r, now, timeZone);
                const ideaHref = `/ideas?q=${encodeURIComponent(r.name)}`;
                const open = () => (r.kind === "project" ? openProject(r.id) : router.push(ideaHref));
                return (
                  <tr key={`${r.kind}:${r.id}`} onClick={open} className={`${TROW} cursor-pointer hover:[&>td]:bg-[var(--ds-surface2)]`}>
                    <td className="max-w-[300px]">
                      {r.kind === "project" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProject(r.id);
                          }}
                          className={`block max-w-full truncate rounded-sm text-left font-semibold text-[var(--ds-ink)] hover:underline ${FOCUS}`}
                        >
                          {r.name}
                        </button>
                      ) : (
                        <Link href={ideaHref} onClick={(e) => e.stopPropagation()} className={`block max-w-full truncate rounded-sm font-semibold text-[var(--ds-ink)] hover:underline ${FOCUS}`}>
                          {r.name}
                        </Link>
                      )}
                      <span className="block truncate text-[12px] text-[var(--ds-ink3)]">{[r.kind === "idea" ? "Idea" : null, r.portfolio?.name, r.priority ? `${r.priority} priority` : null].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="max-w-[180px] truncate whitespace-nowrap text-[var(--ds-ink2)]">{r.sponsor ?? "Not set"}</td>
                    <td className="whitespace-nowrap">{r.stage === "Inactive" ? <span className={PILL_NEUTRAL}>{r.inactiveReason ?? "Inactive"}</span> : <StagePill stage={r.stage} />}</td>
                    <td className="whitespace-nowrap">
                      {r.health === null ? <span className="text-[var(--ds-ink3)]">—</span> : r.health === "None" ? <Chip>No report</Chip> : <HealthPill value={r.health} />}
                    </td>
                    <td className="max-w-[260px] truncate text-[var(--ds-ink2)]">
                      {r.nextStep ? `${r.nextStep.text}${r.nextStep.dueDate ? `, ${formatDayMonth(r.nextStep.dueDate, timeZone)}` : ""}` : <span className="text-[var(--ds-ink3)]">Nothing scheduled</span>}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-[var(--ds-ink2)]" title={days === null ? "Stage entry date not known" : undefined}>
                      <span className="inline-flex items-center gap-1.5">
                        {inStageWords(days)}
                        {stuck && <Chip tone="warn">Stuck</Chip>}
                      </span>
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

/** "5 days", "3 weeks", "4 months" (design "In stage"). */
function inStageWords(days: number | null): string {
  if (days === null) return "Not known";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}
