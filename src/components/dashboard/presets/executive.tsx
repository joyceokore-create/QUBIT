import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus } from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { DecisionQueueRow, ExecutiveDashboard, HeatmapV2 } from "@/server/dashboard-exec";
import { Sparkline } from "@/components/dashboard/sparkline";
import { NeedsAttentionList } from "@/components/dashboard/needs-attention";
import { PipelineTable } from "@/components/dashboard/pipeline-table";
import { CARD, ChangedSection, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// Executive preset v3 (docs/18 §6, superseding 17 §2's layout): hero + decision queue →
// portfolio pipeline table (per-project stat chips replaced the global KPI strip,
// 18 §0 decision №1) → heatmap. Rollout heatmap + market blockers join at M-D.

const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

function Wow({ wow, invert }: { wow: number | null; invert?: boolean }) {
  if (wow === null) return <span className="font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">WoW after snapshots</span>;
  if (wow === 0)
    return (
      <span className="flex items-center gap-0.5 font-mono text-[9px] text-[var(--ink4)]">
        <Minus className="size-2.5" /> flat WoW
      </span>
    );
  const good = invert ? wow < 0 : wow > 0;
  const Icon = wow > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-0.5 font-mono text-[9px] font-bold" style={{ color: good ? "var(--ok)" : "var(--bad)" }}>
      <Icon className="size-2.5" /> {wow > 0 ? "+" : ""}
      {wow} WoW
    </span>
  );
}

function ExecHero({ d, firstName }: { d: ExecutiveDashboard; firstName: string }) {
  return (
    <Panel title={`Good day, ${firstName}`} sub={d.decisionCount ? `${d.decisionCount} DECISION${d.decisionCount === 1 ? "" : "S"} WAITING` : "ALL CLEAR"}>
      <NeedsAttentionList items={d.priorities} nudges={d.nudges.map((n) => ({ id: n.id, entityId: n.entityId }))} />
    </Panel>
  );
}

function HealthTrendCard({ d }: { d: ExecutiveDashboard }) {
  const t = d.healthTrend;
  const tok = t.score >= 70 ? "--ok" : t.score >= 40 ? "--warn" : "--bad";
  return (
    <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-center gap-2">
        <span className="font-mono rv:font-sans text-[9px] rv:text-overline font-medium uppercase tracking-[1.4px] text-[var(--ink4)]">Portfolio health</span>
        {/* §2: never an unexplained number — the "why?" opens the engine's own composition. */}
        <details className="relative ml-auto">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)] hover:text-[var(--qink)]">
            <CircleHelp className="size-3" /> why?
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-[230px] rounded-[10px] border border-[var(--w07)] bg-[var(--qcard)] p-3 text-[11px] leading-[1.6] text-[var(--ink2)] shadow-[var(--cardsh)]">
            Score = on-track ÷ total ({t.factors.onTrack} of {d.health.total}).
            <br />• {t.factors.needAttention} need attention
            <br />• {t.factors.overdueTasks} overdue task{t.factors.overdueTasks === 1 ? "" : "s"}
            <br />• {t.factors.escalationsOpen} open escalation{t.factors.escalationsOpen === 1 ? "" : "s"}
            <br />• {t.factors.planning} in planning
          </div>
        </details>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="font-heading rv:font-data text-[34px] font-bold leading-none tracking-[-1px] tabular-nums" style={{ color: `var(${tok})` }}>
          {t.score}
        </span>
        {t.weekly.length >= 2 ? (
          <Sparkline points={t.weekly} tone={tok} />
        ) : (
          <span className="pb-1 font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">8-week trend accrues nightly</span>
        )}
      </div>
      <Wow wow={t.wow} />
    </div>
  );
}

const QUEUE_KIND: Record<DecisionQueueRow["kind"], { label: string; tok: string }> = {
  escalation: { label: "ESCALATION", tok: "--bad" },
  checkin: { label: "CHECK-IN", tok: "--warn" },
  drafts: { label: "APPROVAL", tok: "--qinfo" },
};

function DecisionQueue({ d }: { d: ExecutiveDashboard }) {
  return (
    <Panel title="Decision queue" sub={`${d.decisionQueue.length} OPEN`}>
      {d.decisionQueue.length ? (
        d.decisionQueue.map((row, i) => {
          const kind = QUEUE_KIND[row.kind];
          return (
            <Link key={i} href={row.href} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
              <span className="w-[86px] flex-none rounded-[5px] border px-1.5 py-0.5 text-center font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: `var(${kind.tok})`, borderColor: `color-mix(in oklab, var(${kind.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${kind.tok}) 9%, transparent)` }}>
                {kind.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{row.title}</span>
              {row.project && <span className="hidden max-w-[180px] truncate font-mono text-[9.5px] text-[var(--ink4)] md:block">{row.project}</span>}
              <span className="w-[44px] flex-none text-right font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">{row.ageDays}d</span>
              <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
            </Link>
          );
        })
      ) : (
        <Empty>Nothing needs a decision right now.</Empty>
      )}
    </Panel>
  );
}

function HeatmapV2Table({ heatmap }: { heatmap: HeatmapV2 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-[8px_16px] text-left font-mono text-[8.5px] font-medium uppercase tracking-[1.2px] text-[var(--ink4)]">Portfolio</th>
            {heatmap.columns.map((c) => (
              <th key={c.id} className="p-[8px_10px] text-center font-mono text-[8.5px] font-medium uppercase tracking-[1.2px] text-[var(--ink4)]">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.rows.map((row) => (
            <tr key={row.portfolioId} className="border-t border-[var(--hair2)]">
              <td className="p-[9px_16px]">
                <Link href={`/portfolios/${row.portfolioId}`} className="text-[12px] font-semibold text-[var(--qink)] hover:text-brand">{row.portfolioName}</Link>
              </td>
              {row.cells.map((cell, i) => (
                <td key={i} className="p-[6px_8px] text-center">
                  {cell ? (
                    // §2: ONE encoding — RAG + Δ arrow. Count/progress live in the tooltip.
                    <span
                      title={`${cell.count} project${cell.count === 1 ? "" : "s"} · ${cell.avgProgress}% avg progress`}
                      className="inline-flex min-w-[52px] items-center justify-center gap-1 rounded-[7px] px-2 py-1.5"
                      style={{ background: `color-mix(in oklab, var(${RAG_TOKEN[cell.rag]}) 14%, transparent)`, color: `var(${RAG_TOKEN[cell.rag]})` }}
                    >
                      <span className="size-2 rounded-full" style={{ background: `var(${RAG_TOKEN[cell.rag]})` }} />
                      {cell.delta === null ? null : cell.delta > 0 ? (
                        <ArrowUpRight className="size-3" aria-label="worsened vs last week" />
                      ) : cell.delta < 0 ? (
                        <ArrowDownRight className="size-3" aria-label="improved vs last week" />
                      ) : (
                        <Minus className="size-3 opacity-60" aria-label="unchanged vs last week" />
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--ink5)]">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExecutivePreset({ d, firstName }: { d: ExecutiveDashboard; firstName: string }) {
  return (
    <>
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <ExecHero d={d} firstName={firstName} />
        <HealthTrendCard d={d} />
      </section>
      <DecisionQueue d={d} />
      {/* docs/18 §6: the pipeline table IS the projects view — milestones/risks/velocity
          became per-row chips; there is no global KPI strip. */}
      <PipelineTable data={d.pipeline} />
      <Panel title={heatmapTitle(d.heatmap.axis)} sub="Δ VS LAST WEEK · HOVER FOR DETAIL">
        <HeatmapV2Table heatmap={d.heatmap} />
      </Panel>
      <ChangedSection delta={d.delta} />
    </>
  );
}

function heatmapTitle(axis: HeatmapV2["axis"]): string {
  return axis === "subsidiary" ? "Portfolio × subsidiary" : "Portfolio × department";
}
