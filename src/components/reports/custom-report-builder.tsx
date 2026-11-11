"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Circle, Download, Printer } from "lucide-react";
import { REPORT_DATASETS, splitDatasets, type ReportDatasetKey } from "@/lib/report-catalogue";
import { PageHeader } from "@/components/list/page-header";
import { SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableFooter } from "@/components/list/table-footer";
import { Panel } from "@/components/ui/panel";
import { formatDate } from "@/lib/dates";
import { matchesSearch, paginate, parseSize, type PageSize } from "@/lib/list-state";
import { toTitleCase } from "@/lib/title-case";
import { FOCUS, PRIMARY, SECONDARY, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * Custom Reports — UX fidelity Tier 3 (design: three cards, Dataset · Columns · Preview, with
 * "Export CSV" and "Export PDF" in the page header). Pick a dataset, tick columns, and the
 * preview refreshes on its own. The full column list per dataset comes from the client-safe
 * registry; the server re-validates every key, so this UI is a convenience, never the control.
 *
 * Export rule (unchanged): the CSV/PDF links are built from the PREVIEW's columns, and are
 * disabled while the preview is loading or out of date, so a download is always exactly what
 * is on screen. Search narrows the preview only; exports carry every row.
 */

const STORAGE_KEY = "qubit.reports.custom.v1";
const SIZE_KEY = "qubit.list.size.custom-report";
const DEFAULT_SIZE: PageSize = 10;

interface SavedSetup {
  dataset?: ReportDatasetKey;
  columnsByDataset?: Partial<Record<ReportDatasetKey, string[]>>;
}

interface ReportResult {
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, string | number | boolean | null>[];
  rowCount: number;
}

function readSaved(): SavedSetup {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as SavedSetup;
  } catch {
    return {};
  }
}

function writeSaved(setup: SavedSetup) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // storage blocked — the choice still holds for this visit
  }
}

function formatCell(value: string | number | boolean | null, type: string, timeZone?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : formatDate(d, timeZone);
  }
  return String(value);
}

/** A checklist row (`.ck li`): green check when on, grey circle when off. */
function CheckRow({ on, label, onClick, role }: { on: boolean; label: string; onClick: () => void; role: "radio" | "checkbox" }) {
  return (
    <li>
      <button
        type="button"
        role={role}
        aria-checked={on}
        onClick={onClick}
        className={cn("flex w-full items-center gap-2 rounded-[6px] py-[3px] text-left text-[13px]", on ? "text-[var(--ds-ink)]" : "text-[var(--ds-ink3)] hover:text-[var(--ds-ink)]", FOCUS)}
      >
        {on ? <Check className="size-3.5 flex-none text-[var(--ds-ok-text)]" aria-hidden /> : <Circle className="size-3.5 flex-none text-[var(--ds-ink3)]" aria-hidden />}
        <span className="min-w-0">{label}</span>
      </button>
    </li>
  );
}

export function CustomReportBuilder({
  allowedDatasets,
  pdfAvailable = false,
  timeZone,
  viewRole,
  title = "Reports",
  description = "Build a report from the data you can see.",
  tabs,
}: {
  allowedDatasets: ReportDatasetKey[];
  pdfAvailable?: boolean;
  /** The tenant's IANA zone, for date cells (U5). */
  timeZone?: string;
  /** "Viewing as" role — decides which datasets are listed first. */
  viewRole?: string | null;
  title?: string;
  description?: string;
  /** The Reports tab strip, rendered between the header and the cards. */
  tabs?: ReactNode;
}) {
  const datasets = useMemo(() => REPORT_DATASETS.filter((d) => allowedDatasets.includes(d.key)), [allowedDatasets]);
  const { featured, more } = useMemo(() => splitDatasets(datasets.map((d) => d.key), viewRole), [datasets, viewRole]);
  const first = datasets.find((d) => d.key === featured[0]) ?? datasets[0];

  const [dataset, setDataset] = useState<ReportDatasetKey>(first?.key ?? "projects");
  const [selected, setSelected] = useState<string[]>(first?.defaults ?? []);
  const [result, setResult] = useState<(ReportResult & { dataset: ReportDatasetKey }) | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(DEFAULT_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const request = useRef(0);

  const meta = datasets.find((d) => d.key === dataset) ?? first;

  // Restore the last setup after mount (SSR-safe; a fresh browser gets the defaults).
  useEffect(() => {
    const saved = readSaved();
    const ds = saved.dataset ? datasets.find((d) => d.key === saved.dataset) : undefined;
    if (ds) {
      const cols = saved.columnsByDataset?.[ds.key]?.filter((k) => ds.columns.some((c) => c.key === k));
      setDataset(ds.key);
      setSelected(cols?.length ? cols : ds.defaults);
    }
    try {
      setSize(parseSize(window.localStorage.getItem(SIZE_KEY), DEFAULT_SIZE));
    } catch {
      // keep the default
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live preview: re-run (debounced) whenever the dataset or the ticked columns change.
  useEffect(() => {
    if (!restored) return;
    if (!selected.length) {
      setResult(null);
      setError("Tick at least one column.");
      return;
    }
    const id = ++request.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/custom?dataset=${dataset}&columns=${selected.join(",")}`);
        const body = await res.json();
        if (id !== request.current) return;
        if (!res.ok) throw new Error(body?.error?.message ?? "The report could not be built.");
        setResult({ ...(body as ReportResult), dataset });
        setPage(1);
      } catch (e) {
        if (id !== request.current) return;
        setResult(null);
        setError(e instanceof Error ? e.message : "The report could not be built.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [dataset, selected, restored]);

  const search = useCallback((next: string) => {
    setQ(next);
    setPage(1);
  }, []);

  function changeSize(next: PageSize) {
    setSize(next);
    setPage(1);
    try {
      window.localStorage.setItem(SIZE_KEY, String(next));
    } catch {
      // storage blocked
    }
  }

  function pickDataset(key: ReportDatasetKey) {
    const ds = datasets.find((d) => d.key === key);
    if (!ds || key === dataset) return;
    const saved = readSaved();
    const cols = saved.columnsByDataset?.[key]?.filter((k) => ds.columns.some((c) => c.key === k));
    setDataset(key);
    setSelected(cols?.length ? cols : ds.defaults);
    setQ("");
    writeSaved({ ...saved, dataset: key });
  }

  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    // Keep the registry's column order regardless of ticking order.
    const ordered = meta.columns.map((c) => c.key).filter((k) => next.includes(k));
    setSelected(ordered);
    const saved = readSaved();
    writeSaved({ dataset, columnsByDataset: { ...saved.columnsByDataset, [dataset]: ordered } });
  }

  const current = result && result.dataset === dataset ? result : null;
  const stale = !current || loading || current.columns.map((c) => c.key).join(",") !== selected.join(",");
  const exportCols = current ? current.columns.map((c) => c.key).join(",") : "";
  const csvHref = `/api/reports/custom?dataset=${dataset}&columns=${exportCols}&format=csv`;
  const pdfHref = `/api/reports/export?template=table&dataset=${dataset}&columns=${exportCols}`;

  const matching = useMemo(
    () => (current ? current.rows.filter((row) => matchesSearch(q, ...current.columns.map((c) => formatCell(row[c.key], c.type, timeZone)))) : []),
    [current, q, timeZone],
  );
  const { rows: previewRows, info } = paginate(matching, page, size);

  if (!datasets.length) return null;

  const exportDisabled = stale || !current || current.rowCount === 0;
  const linkProps = (href: string) =>
    exportDisabled ? { "aria-disabled": true, tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault() } : { href };
  const disabledCls = exportDisabled ? "pointer-events-none opacity-50" : "";

  const label = (key: ReportDatasetKey) => toTitleCase(REPORT_DATASETS.find((d) => d.key === key)?.label ?? key);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <a {...linkProps(csvHref)} download className={cn(SECONDARY, disabledCls)}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
            {pdfAvailable ? (
              <a {...linkProps(pdfHref)} download className={cn(PRIMARY, disabledCls)}>
                <Download className="size-4" aria-hidden /> Export PDF
              </a>
            ) : (
              <a {...linkProps(`${pdfHref}&format=html`)} target="_blank" rel="noreferrer" title="PDF isn't available here — print this view instead" className={cn(PRIMARY, disabledCls)}>
                <Printer className="size-4" aria-hidden /> Print View
              </a>
            )}
          </>
        }
      />
      {tabs}

      <div className="grid items-start gap-4 lg:grid-cols-[200px_200px_minmax(0,1fr)]">
        <Panel title={<span className="text-[14px]">Dataset</span>}>
          <ul role="radiogroup" aria-label="Dataset" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {featured.map((k) => (
              <CheckRow key={k} role="radio" on={k === dataset} label={label(k)} onClick={() => pickDataset(k)} />
            ))}
          </ul>
          {more.length > 0 && (
            <details className="group" open={more.includes(dataset) || undefined}>
              <summary className={cn("cursor-pointer list-none rounded-[6px] text-[12px] font-semibold text-[var(--ds-brand-ink)]", FOCUS)}>
                <span className="group-open:hidden">More Datasets ({more.length})</span>
                <span className="hidden group-open:inline">Fewer Datasets</span>
              </summary>
              <ul role="radiogroup" aria-label="More datasets" className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
                {more.map((k) => (
                  <CheckRow key={k} role="radio" on={k === dataset} label={label(k)} onClick={() => pickDataset(k)} />
                ))}
              </ul>
            </details>
          )}
        </Panel>

        <Panel title={<span className="text-[14px]">Columns</span>}>
          <ul aria-label={`Columns for ${meta.label}`} className="m-0 flex list-none flex-col gap-1.5 p-0">
            {meta.columns.map((c) => (
              <CheckRow key={c.key} role="checkbox" on={selected.includes(c.key)} label={toTitleCase(c.label)} onClick={() => toggle(c.key)} />
            ))}
          </ul>
        </Panel>

        <Panel title={<span className="text-[14px]">Preview{current ? ` · ${current.rowCount} ${current.rowCount === 1 ? "Row" : "Rows"}` : ""}</span>}>
          <p className="-mt-1.5 text-[12px] text-[var(--ds-ink3)]">{meta.description}</p>
          {current && current.rowCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchField value={q} onChange={search} placeholder="Search the preview" label={`Search the ${meta.label.toLowerCase()} preview`} />
              {q && <span className="text-[12px] text-[var(--ds-ink3)]">Search narrows the preview only. Exports include all {current.rowCount} rows.</span>}
            </div>
          )}
          {error && (
            <p role="alert" className="text-[12.5px] font-semibold text-[var(--ds-bad-text)]">
              {error}
            </p>
          )}
          <div aria-busy={loading} className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
            {!current ? (
              !error && <p className="py-6 text-center text-[12.5px] text-[var(--ds-ink3)]">Building the preview…</p>
            ) : current.rowCount === 0 ? (
              <ListEmpty filtered={false} noun="rows" hint="Nothing in scope for this report yet." />
            ) : matching.length === 0 ? (
              <ListEmpty filtered noun="rows" onClear={() => search("")} />
            ) : (
              <table className="w-full border-separate border-spacing-0 text-left text-[12.5px]">
                <thead className={THEAD}>
                  <tr>
                    {current.columns.map((c) => (
                      <th key={c.key} scope="col" className="whitespace-nowrap">
                        {toTitleCase(c.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={info.skip + i} className={TROW}>
                      {current.columns.map((c, ci) => (
                        <td
                          key={c.key}
                          className={cn("max-w-[36ch] truncate text-[var(--ds-ink2)]", ci === 0 && "font-semibold text-[var(--ds-ink)]")}
                          title={row[c.key] === null ? undefined : String(row[c.key])}
                        >
                          {formatCell(row[c.key], c.type, timeZone)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {current && current.rowCount > 0 && <TableFooter info={info} onPage={setPage} onSize={changeSize} noun="rows" />}
        </Panel>
      </div>
    </div>
  );
}
