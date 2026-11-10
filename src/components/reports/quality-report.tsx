import { ExportButton } from "@/components/export-button";
import { QualityByProject } from "@/components/reports/quality-by-project";
import { CARD_GLASS as CARD, CARD_BG } from "@/lib/surface";
import { weekLabel, type WeeklyCount } from "@/lib/quality-report";
import type { TenantContext } from "@/lib/tenant";
import { getQualityReport } from "@/server/quality-report";

/**
 * UX9 (UX plan D13) — Reports › Quality, the Head of QA's tab: critical issues opened per
 * week (8 weeks) and quality by project, with a CSV export of the table. Pass rate is NOT
 * shown — QUBIT has no test-case results yet — and the tab says so in one line.
 */
export async function QualityReport({ ctx }: { ctx: TenantContext }) {
  const report = await getQualityReport(ctx);
  const n = report.rows.length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <h2 className="text-[15px] font-semibold text-[var(--qink)]">
            Quality across {n} active {n === 1 ? "project" : "projects"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--ink3)]">Pass rate appears once test results are tracked.</p>
        </div>
        <ExportButton href="/api/reports/quality?format=csv" />
      </div>
      <WeeklyCritical weeks={report.weekly} timeZone={report.timeZone} />
      <QualityByProject rows={report.rows} />
    </div>
  );
}

/** A single-series bar chart, every bar labelled with its number; a hidden table for screen readers. */
function WeeklyCritical({ weeks, timeZone }: { weeks: WeeklyCount[]; timeZone: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.opened));
  const total = weeks.reduce((s, w) => s + w.opened, 0);
  const last = weeks.length - 1;
  const labels = weeks.map((w) => weekLabel(w.isoWeek, timeZone));
  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="quality-weekly">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--hair2)] p-[14px_18px]">
        <h2 id="quality-weekly" className="text-[15px] font-semibold text-[var(--qink)]">
          Critical issues opened per week
        </h2>
        <p className="text-[12px] text-[var(--ink3)]">
          Critical bugs and Critical issues · last {weeks.length} weeks · {total} in total
        </p>
      </div>
      <div className="relative px-[18px] pb-3 pt-4">
        {total === 0 && (
          <p className="absolute inset-x-[18px] top-[52px] text-center text-[12.5px] text-[var(--ink3)]">No critical bugs or issues were opened in these weeks.</p>
        )}
        <ol className="grid h-[150px] items-end gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} aria-hidden>
          {weeks.map((w, i) => (
            <li key={w.isoWeek} className="flex h-full flex-col items-center justify-end gap-1" title={`${labels[i]!.short} (week of ${labels[i]!.monday}): ${w.opened} opened`}>
              <span className={`text-[12px] tabular-nums ${w.opened ? "font-semibold text-[var(--qink)]" : "text-[var(--ink4)]"}`}>{w.opened}</span>
              <span
                className="w-full max-w-[36px] rounded-t-[4px]"
                style={{
                  height: w.opened ? `${Math.max(4, (w.opened / max) * 110)}px` : "0px",
                  background: "var(--qinfo)",
                  opacity: i === last ? 1 : 0.75,
                }}
              />
            </li>
          ))}
        </ol>
        <ol className="mt-0 grid gap-2 border-t border-[var(--hair2)] pt-1.5 text-center" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} aria-hidden>
          {labels.map((l, i) => (
            <li key={weeks[i]!.isoWeek} className="min-w-0 leading-tight">
              <span className={`block text-[11px] ${i === last ? "font-bold text-[var(--qink)]" : "text-[var(--ink4)]"}`}>{l.short}</span>
              <span className="hidden truncate text-[10.5px] text-[var(--ink5)] sm:block">{l.monday}</span>
            </li>
          ))}
        </ol>
        <table className="sr-only">
          <caption>Critical bugs and Critical issues opened per week, oldest first</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Week of</th>
              <th scope="col">Opened</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.isoWeek}>
                <th scope="row">{labels[i]!.short}</th>
                <td>{labels[i]!.monday}</td>
                <td>{w.opened}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
