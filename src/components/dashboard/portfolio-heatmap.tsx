import Link from "next/link";
import type { HeatmapData } from "@/server/dashboard";

// Portfolio × subsidiary heatmap (M1 — built since Phase A, finally rendered). The
// dashboard's drill-down entry point: cells → subsidiary page, rows → portfolio page.
// Status is never colour-only (design language, docs/16 §11): every cell carries a
// two-letter status tag alongside the tint.

const STATUS_META: Record<string, { tok: string; tag: string; label: string }> = {
  OnTrack: { tok: "--ok", tag: "OK", label: "On track" },
  AtRisk: { tok: "--warn", tag: "AR", label: "At risk" },
  Overdue: { tok: "--bad", tag: "OD", label: "Overdue" },
};

export function PortfolioHeatmap({ data }: { data: HeatmapData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-[8px_16px] text-left font-mono text-[8.5px] font-medium uppercase tracking-[1.4px] text-[var(--ink4)]">
              Portfolio
            </th>
            {data.orgUnits.map((ou) => (
              <th
                key={ou.id}
                className="p-[8px_10px] text-center font-mono text-[8.5px] font-medium uppercase tracking-[1.4px] text-[var(--ink4)]"
                title={ou.name}
              >
                {ou.flag ? `${ou.flag} ` : ""}
                {ou.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.portfolioId} className="border-t border-[var(--hair2)]">
              <td className="max-w-[220px] p-[9px_16px]">
                <Link href={`/portfolios/${row.portfolioId}`} className="block truncate text-[12.5px] font-semibold text-[var(--qink)] hover:underline">
                  {row.portfolioName}
                </Link>
                <span className="font-mono text-[9px] text-[var(--ink4)]">{row.itemCount} projects</span>
              </td>
              {row.cells.map((cell, i) => {
                const ou = data.orgUnits[i];
                if (!cell) {
                  return (
                    <td key={ou.id} className="p-[6px_6px] text-center font-mono text-[10px] text-[var(--ink5)]">
                      —
                    </td>
                  );
                }
                const m = STATUS_META[cell.status] ?? STATUS_META.OnTrack;
                return (
                  <td key={ou.id} className="p-[6px_6px] text-center">
                    <Link
                      href={`/subsidiaries/${ou.id}`}
                      title={`${ou.name} · ${cell.count} project${cell.count === 1 ? "" : "s"} · ${m.label} · avg ${cell.pct}%`}
                      className="inline-flex min-w-[64px] flex-col items-center gap-0.5 rounded-[8px] border p-[6px_8px] transition-transform hover:scale-[1.04]"
                      style={{
                        color: `var(${m.tok})`,
                        borderColor: `color-mix(in oklab, var(${m.tok}) 35%, transparent)`,
                        background: `color-mix(in oklab, var(${m.tok}) 10%, transparent)`,
                      }}
                    >
                      <span className="font-mono text-[12px] font-bold tabular-nums">{cell.pct}%</span>
                      <span className="font-mono text-[8px] uppercase tracking-[1px]">
                        {m.tag} · {cell.count}
                      </span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
