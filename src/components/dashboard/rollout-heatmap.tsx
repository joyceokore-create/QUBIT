import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { RolloutMatrix } from "@/server/rollout";
import { RAG_TOKEN } from "@/lib/surface";

// The rollout heatmap (docs/18 §3.1/§6): child projects × market columns, a portfolio
// summary row, and the top-blockers strip. Per 17 §2's ONE-encoding rule a cell shows
// RAG + Δ only — counts and % live in the tooltip and the accessible label, so colour
// is never the sole channel (16 §11). A project that doesn't ship in a market renders
// "—", never a misleading 0%.

const SEVERITY_TOK: Record<string, string> = { Critical: "--bad", High: "--warn", Medium: "--qinfo", Low: "--ink4" };

function Delta({ delta }: { delta: -1 | 0 | 1 | null }) {
  if (delta === null) return null;
  if (delta > 0) return <ArrowUpRight className="size-3" aria-hidden />;
  if (delta < 0) return <ArrowDownRight className="size-3" aria-hidden />;
  return <Minus className="size-3 opacity-60" aria-hidden />;
}

function deltaWord(delta: -1 | 0 | 1 | null): string {
  if (delta === null) return "no history";
  return delta > 0 ? "worsened vs last week" : delta < 0 ? "improved vs last week" : "unchanged vs last week";
}

export function RolloutHeatmap({ matrix }: { matrix: RolloutMatrix }) {
  if (!matrix.markets.length || !matrix.rows.length) {
    return (
      <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
        No market tracks yet — add a market track on a project to populate this view.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-[8px_16px] text-left font-mono text-[8.5px] font-medium uppercase tracking-[1.2px] text-[var(--ink4)]">
                Project
              </th>
              {matrix.markets.map((m) => (
                <th
                  key={m.id}
                  className="p-[8px_10px] text-center font-mono text-[8.5px] font-medium uppercase tracking-[1.2px] text-[var(--ink4)]"
                >
                  {`${m.flag ?? ""} ${m.code}`.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.projectId} className="border-t border-[var(--hair2)]">
                <td className="p-[9px_16px]">
                  <Link href={`/projects/${row.projectId}`} className="text-[12px] font-semibold text-[var(--qink)] hover:text-[var(--brand)]">
                    {row.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-[9px] tabular-nums text-[var(--ink4)]">{row.progress}%</span>
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.orgUnitId} className="p-[6px_8px] text-center">
                    {cell.rag ? (
                      <Link
                        href={`/projects/${row.projectId}/markets/${cell.orgUnitId}`}
                        title={`${cell.progress}% · ${cell.gatesDone}/${cell.gatesTotal} gates · ${deltaWord(cell.delta)}${cell.narrative ? ` · ${cell.narrative}` : ""}`}
                        aria-label={`${row.name} in this market: ${cell.rag}, ${cell.progress}%, ${deltaWord(cell.delta)}`}
                        className="inline-flex min-w-[52px] items-center justify-center gap-1 rounded-[7px] px-2 py-1.5"
                        style={{
                          background: `color-mix(in oklab, var(${RAG_TOKEN[cell.rag]}) 14%, transparent)`,
                          color: `var(${RAG_TOKEN[cell.rag]})`,
                        }}
                      >
                        <span className="size-2 rounded-full" style={{ background: `var(${RAG_TOKEN[cell.rag]})` }} />
                        <Delta delta={cell.delta} />
                      </Link>
                    ) : (
                      <span className="font-mono text-[10px] text-[var(--ink5)]" aria-label="not shipping in this market">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {/* Portfolio summary row (§3.1) — derived from the columns above. */}
            <tr className="border-t border-[var(--hair)] bg-[var(--wash)]">
              <td className="p-[9px_16px] font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--qink)]">
                All {matrix.portfolioName}
              </td>
              {matrix.summary.map((s) => (
                <td key={s.orgUnitId} className="p-[6px_8px] text-center">
                  {s.rag ? (
                    <span className="font-mono text-[9.5px] font-bold tabular-nums" style={{ color: `var(${RAG_TOKEN[s.rag]})` }}>
                      {s.progress}%
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--ink5)]">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {matrix.topBlockers.length > 0 && (
        <div className="border-t border-[var(--hair)]">
          <div className="p-[8px_16px] font-mono text-[8.5px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">
            Top blockers
          </div>
          {matrix.topBlockers.map((b) => (
            <div key={b.id} className="flex items-start gap-2.5 border-b border-[var(--hair2)] p-[8px_16px] last:border-0">
              <span
                className="mt-[3px] w-[3px] flex-none self-stretch rounded-[2px]"
                style={{ background: `var(${SEVERITY_TOK[b.severity] ?? "--ink4"})` }}
              />
              <span className="min-w-0 flex-1 text-[12px] leading-[1.45] text-[var(--ink2)]">{b.description}</span>
              <span className="flex-none font-mono text-[9px] uppercase text-[var(--ink4)]">{b.projectCode}</span>
              <span className="flex-none font-mono text-[9px] tabular-nums text-[var(--ink4)]">{b.ageDays}d</span>
            </div>
          ))}
        </div>
      )}
      <div className="p-[8px_16px] font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
        Cell = RAG + Δ vs last week · % and gate counts in the tooltip · click a cell for the track
      </div>
    </div>
  );
}
