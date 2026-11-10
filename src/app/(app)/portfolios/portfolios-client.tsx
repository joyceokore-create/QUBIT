"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthPill, StagePill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { matchesSearch, paginate } from "@/lib/list-state";
import { STAGES } from "@/lib/status-words";

// UX5 (L1–L5): the portfolio index as one table — header (+ New portfolio top right),
// toolbar outside the card, always-visible pagination, all view state in the URL. A tenant
// has a handful of portfolios and health is worked out in code, so it loads once and pages
// in the browser.
//
// Filters follow the plan's Portfolios row (Sponsor, Priority, Stage, Health) where the data
// has it: Sponsor = the portfolio owner, Stage = the business-pipeline category. Portfolios
// carry no priority, so that filter is left out.

interface PortfolioRow {
  id: string;
  name: string;
  /** Business pipeline: Approved | Exploring | Shelved. */
  category: string;
  viewKind: string;
  /** Worst status of its projects (OnTrack | AtRisk | Overdue); null when it has none. */
  health: "OnTrack" | "AtRisk" | "Overdue" | null;
  itemCount: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  avgProgress: number;
  /** Flags (or codes) of the markets its projects run in. */
  markets: string[];
  owner: string | null;
}

const CATEGORY_ORDER = ["Approved", "Exploring", "Shelved"];
const HEALTH_ORDER = ["Overdue", "AtRisk", "OnTrack", "None"] as const;
const HEALTH_LABEL: Record<(typeof HEALTH_ORDER)[number], string> = { Overdue: "Off track", AtRisk: "At risk", OnTrack: "On track", None: "No projects yet" };
const FILTER_KEYS = ["owner", "stage", "health"] as const;
const FILTER_LABEL: Record<(typeof FILTER_KEYS)[number], string> = { owner: "Sponsor", stage: "Stage", health: "Health" };
const NONE = "__none";

const rank = (order: readonly string[], v: string) => {
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
};

/** "12 on track · 3 at risk · 7 planning or closed" — only the non-zero parts, and it always
 * adds up to the project count (planning, completed and cancelled carry no health). */
function breakdown(p: PortfolioRow): string {
  const other = Math.max(0, p.itemCount - p.onTrack - p.atRisk - p.overdue);
  return [
    [p.onTrack, "on track"],
    [p.atRisk, "at risk"],
    [p.overdue, "off track"],
    [other, "planning or closed"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}

/** A category that is a lifecycle stage gets its stage colour (D8a); anything else (Shelved) stays neutral. */
function CategoryPill({ value }: { value: string }) {
  if ((STAGES as readonly string[]).includes(value)) return <StagePill stage={value} />;
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-[var(--border)] px-2 text-[12px] font-semibold text-[var(--ink3)]">{value}</span>
  );
}

export function PortfoliosClient({ portfolios, canCreate, tenantName }: { portfolios: PortfolioRow[]; canCreate: boolean; tenantName: string }) {
  const router = useRouter();
  const list = useListUrl("portfolios", 10);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<(typeof FILTER_KEYS)[number], string>;
  const healthOf = (p: PortfolioRow) => p.health ?? "None";

  const opts = useMemo<Record<(typeof FILTER_KEYS)[number], FilterOption[]>>(() => {
    const owners = [...new Set(portfolios.map((p) => p.owner ?? NONE))].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)));
    const stages = [...new Set(portfolios.map((p) => p.category))].sort((a, b) => rank(CATEGORY_ORDER, a) - rank(CATEGORY_ORDER, b) || a.localeCompare(b));
    return {
      owner: owners.map((o) => ({ value: o, label: o === NONE ? "No sponsor set" : o })),
      stage: stages.map((s) => ({ value: s, label: s })),
      health: HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h] })),
    };
  }, [portfolios]);

  const filtered = useMemo(
    () =>
      portfolios
        .filter(
          (p) =>
            matchesSearch(list.q, p.name, p.owner) &&
            (!f.owner || (p.owner ?? NONE) === f.owner) &&
            (!f.stage || p.category === f.stage) &&
            (!f.health || healthOf(p) === f.health),
        )
        // Same grouping the cards had: Approved · Exploring · Shelved, then by name.
        .sort((a, b) => rank(CATEGORY_ORDER, a.category) - rank(CATEGORY_ORDER, b.category) || a.name.localeCompare(b.name)),
    [portfolios, list.q, f.owner, f.stage, f.health],
  );
  const { rows, info } = paginate(filtered, list.page, list.size);

  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === f[k])?.label ?? f[k]}`,
  }));
  const isFiltered = active.length > 0 || !!list.q;
  // The header's button is the page's one filled primary; the empty state repeats it outlined.
  const newButton = (variant: "default" | "outline") =>
    canCreate && (
      <Button nativeButton={false} variant={variant} render={<Link href="/portfolios/new" />}>
        <Plus /> New portfolio
      </Button>
    );

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={tenantName}
        title="Portfolios"
        description={`${portfolios.length} ${portfolios.length === 1 ? "portfolio" : "portfolios"}. Health is the worst status among each portfolio's projects.`}
        actions={newButton("default")}
      />

      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search portfolios or sponsors" label="Search portfolios" />
          <FilterSelect label="Sponsor" allLabel="All sponsors" value={f.owner} options={opts.owner} onChange={(v) => list.set({ owner: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Health" allLabel="All health" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </div>

      <TableCard footer={<TableFooter info={info} noun="portfolios" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty filtered={isFiltered} noun="portfolios" onClear={() => list.clear([...FILTER_KEYS])} action={newButton("outline")} />
        ) : (
          <table className="relative w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Portfolio</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Sponsor</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Health</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Projects</th>
                <th scope="col" className="w-[150px] px-3 py-2.5 font-semibold">Progress</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Markets</th>
                <th scope="col" className="w-8 px-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/portfolios/${p.id}`)}
                  className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="max-w-[320px] px-4 py-2.5">
                    <Link
                      href={`/portfolios/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block max-w-full truncate rounded-sm font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                    >
                      {p.name}
                    </Link>
                    <span className="block truncate text-[12px] text-[var(--ink3)]">{p.viewKind} view</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{p.owner ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <CategoryPill value={p.category} />
                  </td>
                  <td className="px-3 py-2.5" title={p.health ? "Worst status among its projects" : "No projects in this portfolio yet"}>
                    {p.health ? <HealthPill value={p.health} /> : <span className="text-[12px] font-semibold text-[var(--ink3)]">No projects yet</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="font-semibold tabular-nums text-[var(--qink)]">{p.itemCount}</span>
                    {p.itemCount > 0 && <span className="block text-[12px] text-[var(--ink3)]">{breakdown(p)}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${p.avgProgress}%` }} />
                      </span>
                      <span className="w-[34px] text-right text-[12px] tabular-nums text-[var(--ink2)]">{p.avgProgress}%</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-[var(--ink2)]">{p.markets.length ? p.markets.join(" ") : "—"}</td>
                  <td className="px-2 py-2.5">
                    <ChevronRight className="size-4 text-[var(--ink3)]" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </main>
  );
}
