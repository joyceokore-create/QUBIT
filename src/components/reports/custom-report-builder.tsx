"use client";

import { useEffect, useMemo, useState } from "react";
import {
  REPORT_DATASETS,
  type ReportColumn,
  type ReportDatasetKey,
} from "@/lib/report-catalogue";
import { ExportButton } from "@/components/export-button";
import { CARD } from "@/lib/surface";

// Custom Reports builder — pick a dataset, tick the columns, PREVIEW, then export. The
// full column list per dataset comes straight from the client-safe registry; the server
// re-validates every key, so this UI is a convenience, never the control. The preview
// table renders the JSON route's rows (capped at PREVIEW_ROWS until expanded); Export CSV
// links the same URL with format=csv and only appears once a preview is on screen, so
// what gets downloaded is always something the user has looked at first (the
// export-button rule: no client-side data path that could drift from the screen).

const STORAGE_KEY = "qubit.reports.custom.v1";
const PREVIEW_ROWS = 20;

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

function formatCell(value: string | number | boolean | null, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
}

export function CustomReportBuilder({ allowedDatasets }: { allowedDatasets: ReportDatasetKey[] }) {
  const datasets = useMemo(
    () => REPORT_DATASETS.filter((d) => allowedDatasets.includes(d.key)),
    [allowedDatasets],
  );
  const [dataset, setDataset] = useState<ReportDatasetKey>(datasets[0]?.key ?? "projects");
  const [selected, setSelected] = useState<string[]>(datasets[0]?.defaults ?? []);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [showAll, setShowAll] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setShowAll(false);
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
  const previewRows = result ? (showAll ? result.rows : result.rows.slice(0, PREVIEW_ROWS)) : [];
  const hiddenRows = result ? result.rowCount - previewRows.length : 0;
  const stale = result ? selected.join(",") !== result.columns.map((c) => c.key).join(",") : false;
  const enumHint = (c: ReportColumn) => (c.values ? `Values: ${c.values.join(" · ")}` : undefined);

  if (!datasets.length) return null;

  return (
    <>
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
            <span className="font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">
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
                {c.type === "enum" && <span className="flex-none font-mono text-[8px] uppercase tracking-[.6px] text-[var(--ink5)]">enum</span>}
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
        <div className={CARD} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hair)] p-[12px_16px]">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{meta.label}</span>
            <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--brand)]">
              Preview
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.columns.length} columns
            </span>
            {stale && (
              <span className="text-[11px] font-semibold text-[var(--warn)]">
                Column selection changed — preview again to refresh; the export matches this preview.
              </span>
            )}
            <span className="ml-auto">
              <ExportButton href={csvHref} label={`Export CSV (${result.rowCount} rows)`} />
            </span>
          </div>
          {result.rowCount === 0 ? (
            <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">No rows in scope.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c.key} className="whitespace-nowrap border-b border-[var(--hair)] p-[8px_16px] font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-[var(--hair2)] last:border-0">
                        {result.columns.map((c) => (
                          <td key={c.key} className="max-w-[36ch] truncate p-[8px_16px] text-[12px] text-[var(--ink2)]" title={row[c.key] === null ? undefined : String(row[c.key])}>
                            {formatCell(row[c.key], c.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(hiddenRows > 0 || showAll) && result.rowCount > PREVIEW_ROWS && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hair)] p-[10px_16px]">
                  <span className="text-[11.5px] text-[var(--ink4)]">
                    {showAll
                      ? `Showing all ${result.rowCount} rows.`
                      : `Showing the first ${previewRows.length} of ${result.rowCount} rows — the CSV export includes every row.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
                  >
                    {showAll ? `Show first ${PREVIEW_ROWS}` : `Show all ${result.rowCount}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
