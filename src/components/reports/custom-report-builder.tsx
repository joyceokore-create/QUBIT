"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  REPORT_DATASETS,
  type ReportColumn,
  type ReportDatasetKey,
} from "@/lib/report-catalogue";
import { ExportButton } from "@/components/export-button";
import { ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { formatDate } from "@/lib/dates";
import { matchesSearch, paginate, parseSize, type PageSize } from "@/lib/list-state";
import { CARD } from "@/lib/surface";

// Custom Reports builder — pick a dataset, tick the columns, PREVIEW, then export. The
// full column list per dataset comes straight from the client-safe registry; the server
// re-validates every key, so this UI is a convenience, never the control. The preview
// table renders the JSON route's rows with search and pagination (UX6, D13 + L1–L3: browser
// paging over the rows the route returned; search narrows the preview only); Export CSV
// links the same URL with format=csv and only appears once a preview is on screen, so
// what gets downloaded is always something the user has looked at first (the
// export-button rule: no client-side data path that could drift from the screen).
// Milestone D: the same preview also exports as a PDF in the report print style
// (/api/reports/export?template=table) — or opens as a print view where no PDF engine exists.

const STORAGE_KEY = "qubit.reports.custom.v1";
// Same per-table key shape as useListUrl, so the remembered rows-per-page follows L3.
const SIZE_KEY = "qubit.list.size.custom-report";
const DEFAULT_SIZE: PageSize = 10;

function readStoredSize(): PageSize {
  try {
    return parseSize(window.localStorage.getItem(SIZE_KEY), DEFAULT_SIZE);
  } catch {
    return DEFAULT_SIZE;
  }
}

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

function formatCell(value: string | number | boolean | null, type: string, timeZone?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") {
    const d = new Date(String(value));
    // U5: one date format, in the tenant's time zone (never the browser's default).
    return Number.isNaN(d.getTime()) ? String(value) : formatDate(d, timeZone);
  }
  return String(value);
}

export function CustomReportBuilder({
  allowedDatasets,
  pdfAvailable = false,
  timeZone,
}: {
  allowedDatasets: ReportDatasetKey[];
  pdfAvailable?: boolean;
  /** The tenant's IANA zone, for date cells (U5). */
  timeZone?: string;
}) {
  const datasets = useMemo(
    () => REPORT_DATASETS.filter((d) => allowedDatasets.includes(d.key)),
    [allowedDatasets],
  );
  const [dataset, setDataset] = useState<ReportDatasetKey>(datasets[0]?.key ?? "projects");
  const [selected, setSelected] = useState<string[]>(datasets[0]?.defaults ?? []);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(DEFAULT_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = datasets.find((d) => d.key === dataset) ?? datasets[0];

  // Restore the last setup after mount (SSR-safe; a fresh browser gets the defaults).
  useEffect(() => {
    const saved = readSaved();
    const savedDataset = saved.dataset && datasets.some((d) => d.key === saved.dataset) ? saved.dataset : undefined;
    if (savedDataset) {
      setDataset(savedDataset);
      const ds = datasets.find((d) => d.key === savedDataset)!;
      const cols = saved.columnsByDataset?.[savedDataset]?.filter((k) => ds.columns.some((c) => c.key === k));
      setSelected(cols?.length ? cols : ds.defaults);
    }
    setSize(readStoredSize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // storage blocked — the choice still holds for this visit
    }
  }

  function persist(nextDataset: ReportDatasetKey, nextColumns: string[]) {
    const saved = readSaved();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dataset: nextDataset,
        columnsByDataset: { ...saved.columnsByDataset, [nextDataset]: nextColumns },
      } satisfies SavedSetup),
    );
  }

  function pickDataset(key: ReportDatasetKey) {
    const ds = datasets.find((d) => d.key === key);
    if (!ds) return;
    const saved = readSaved().columnsByDataset?.[key]?.filter((k) => ds.columns.some((c) => c.key === k));
    setDataset(key);
    setSelected(saved?.length ? saved : ds.defaults);
    setResult(null);
    setError(null);
  }

  function toggle(key: string) {
    setSelected((prev) => {
      // Keep the registry's column order regardless of ticking order.
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      const ordered = meta.columns.map((c) => c.key).filter((k) => next.includes(k));
      persist(dataset, ordered);
      return ordered;
    });
  }

  function setAll(keys: string[]) {
    setSelected(keys);
    persist(dataset, keys);
  }

  async function generate() {
    if (!selected.length) {
      setError("Pick at least one column.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/custom?dataset=${dataset}&columns=${selected.join(",")}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "The report could not be generated.");
      setResult(body as ReportResult);
      setQ("");
      setPage(1);
      persist(dataset, selected);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "The report could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  // Export exactly what was previewed — the href is built from the RESULT's columns, so
  // re-ticking boxes after a preview can never make the file differ from the screen.
  const csvHref = result
    ? `/api/reports/custom?dataset=${dataset}&columns=${result.columns.map((c) => c.key).join(",")}&format=csv`
    : "";
  const pdfHref = result
    ? `/api/reports/export?template=table&dataset=${dataset}&columns=${result.columns.map((c) => c.key).join(",")}`
    : "";
  // Search runs over every row as the person sees it (formatted cells), then pages (L1/L3).
  const matching = useMemo(
    () =>
      result
        ? result.rows.filter((row) => matchesSearch(q, ...result.columns.map((c) => formatCell(row[c.key], c.type, timeZone))))
        : [],
    [result, q, timeZone],
  );
  const { rows: previewRows, info } = paginate(matching, page, size);
  const stale = result ? selected.join(",") !== result.columns.map((c) => c.key).join(",") : false;
  const enumHint = (c: ReportColumn) => (c.values ? `Values: ${c.values.join(" · ")}` : undefined);

  if (!datasets.length) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hair)] p-[12px_16px]">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Build a report</span>
          <label className="ml-auto flex items-center gap-2 text-[11px] text-[var(--ink4)]">
            Module
            <select
              value={dataset}
              onChange={(e) => pickDataset(e.target.value as ReportDatasetKey)}
              className="rounded-[7px] border border-[var(--w07)] bg-[var(--cardbg)] px-2 py-1.5 text-[12px] font-semibold text-[var(--qink)]"
            >
              {[...new Set(datasets.map((d) => d.moduleLabel))].map((mod) => (
                <optgroup key={mod} label={mod}>
                  {datasets.filter((d) => d.moduleLabel === mod).map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 p-[12px_16px]">
          <p className="text-[12px] text-[var(--ink4)]">{meta.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[var(--ink4)]">
              Columns · {selected.length}/{meta.columns.length}
            </span>
            <button type="button" onClick={() => setAll(meta.defaults)} className="rounded-[7px] border border-[var(--w07)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">Defaults</button>
            <button type="button" onClick={() => setAll(meta.columns.map((c) => c.key))} className="rounded-[7px] border border-[var(--w07)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">Select all</button>
            <button type="button" onClick={() => setAll([])} className="rounded-[7px] border border-[var(--w07)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">Clear</button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {meta.columns.map((c) => (
              <label key={c.key} title={enumHint(c)} className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ink2)]">
                <input
                  type="checkbox"
                  checked={selected.includes(c.key)}
                  onChange={() => toggle(c.key)}
                  className="size-3.5 accent-[var(--brand)]"
                />
                <span className="min-w-0 truncate">{c.label}</span>
                {c.type === "enum" && <span className="flex-none text-[11px] uppercase tracking-[.06em] text-[var(--ink5)]">enum</span>}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={loading || !selected.length}
              className="rounded-[8px] bg-[var(--brand)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--onbrand)] disabled:opacity-50"
            >
              {loading ? "Building preview…" : "Preview report"}
            </button>
            {!result && (
              <span className="text-[11px] text-[var(--ink5)]">Preview the report first — export lives on the preview.</span>
            )}
            {error && <span role="alert" className="text-[12px] text-[var(--bad)]">{error}</span>}
          </div>
        </div>
      </div>

      {result && (
        <section aria-label={`${meta.label} preview`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{meta.label}</span>
            <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] text-[var(--brand)]">
              Preview
            </span>
            <span className="text-[11px] uppercase tracking-[.06em] text-[var(--ink4)]">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.columns.length} columns
            </span>
            {stale && (
              <span className="text-[11px] font-semibold text-[var(--warn)]">
                Column selection changed — preview again to refresh; the export matches this preview.
              </span>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {pdfAvailable ? (
                <ExportButton href={pdfHref} label="Export PDF" />
              ) : (
                <a
                  href={`${pdfHref}&format=html`}
                  target="_blank"
                  rel="noreferrer"
                  title="PDF rendering isn't available here — print this view instead"
                  className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
                >
                  Print view
                </a>
              )}
              <ExportButton href={csvHref} label={`Export CSV (${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"})`} />
            </span>
          </div>

          {result.rowCount > 0 && (
            <ListToolbar label="Search the preview">
              <SearchField value={q} onChange={search} placeholder="Search any column" label={`Search ${meta.label.toLowerCase()}`} />
              {q && (
                <span className="text-[11.5px] text-[var(--ink4)]">
                  Search narrows the preview only — exports include all {result.rowCount} rows.
                </span>
              )}
            </ListToolbar>
          )}

          <TableCard footer={<TableFooter info={info} onPage={setPage} onSize={changeSize} noun="rows" />}>
            {result.rowCount === 0 ? (
              <ListEmpty filtered={false} noun="rows" hint="Nothing in scope for this report yet." />
            ) : matching.length === 0 ? (
              <ListEmpty filtered noun="rows" onClear={() => search("")} />
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap border-b border-[var(--hair)] p-[8px_16px] text-[11px] font-bold uppercase tracking-[.06em] text-[var(--ink4)]">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={info.skip + i} className="border-b border-[var(--hair2)] last:border-0">
                      {result.columns.map((c) => (
                        <td key={c.key} className="max-w-[36ch] truncate p-[8px_16px] text-[12px] text-[var(--ink2)]" title={row[c.key] === null ? undefined : String(row[c.key])}>
                          {formatCell(row[c.key], c.type, timeZone)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
        </section>
      )}
    </div>
  );
}
