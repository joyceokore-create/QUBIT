import type { CockpitData, CockpitProject } from "@/server/dashboard-cockpit";
import { calcRagCounts, CALC_ORDER } from "@/server/dashboard-cockpit";
import { Tile, RagBar, RagChip, DisputeGap, DimensionSquares, RagTrend, RiskList } from "./primitives";

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;
const CATEGORY_ORDER = ["Approved", "Exploring", "Shelved", "Unfiled"];

export function ExecCockpit({ data }: { data: CockpitData }) {
  const all = data.projects;
  const active = all.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const approved = active.filter((p) => p.category === "Approved");
  const live = all.filter((p) => p.status === "Completed").length;
  const counts = calcRagCounts(approved.length ? approved : active);

  // Decisions needing Group action — derived from real signals (aged red risks, disputes on
  // passed-target projects, blocked delivery), sorted by staleness.
  const decisions = active
    .filter((p) => p.redRisks > 0 || (p.dispute && p.targetPassed) || (p.calculated === "R" && p.freshnessDays > 7))
    .sort((a, b) => b.freshnessDays - a.freshnessDays)
    .slice(0, 10);

  const buckets = CATEGORY_ORDER.map((c) => ({ c, n: all.filter((p) => p.category === c).length })).filter((b) => b.n > 0);
  const maxB = Math.max(1, ...buckets.map((b) => b.n));
  const bcol: Record<string, string> = { Approved: "var(--ok)", Exploring: "var(--warn)", Shelved: "var(--ink4)", Unfiled: "var(--ink4)" };

  const risks = active.flatMap((p) => p.risks.filter((r) => r.severity === "R").map((r) => ({ ...r }))).slice(0, 5);
  const table = approved.slice().sort((a, b) => CALC_ORDER[a.calculated] - CALC_ORDER[b.calculated]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--qink)]">Executive — portfolio health & decisions</h1>
        <p className="mt-1 text-[14px] text-[var(--ink2)]">{all.length} initiatives across the pipeline. Delivery is moving; a concentrated set of decisions gates progress.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile value={all.length} label="Initiatives in the pipeline" detail={`${approved.length} approved & funded`} />
        <Tile value={live} label="Live in production" detail="completed & shipped" />
        <Tile value={approved.length} label="Approved portfolio RAG" detail={`${counts.R} red · ${counts.A} amber · ${counts.G} green`}><RagBar counts={counts} /></Tile>
        <Tile value={decisions.length} label="Decisions needing action" detail={`${decisions.filter((d) => d.freshnessDays > 30).length} older than 30 days`} hot={decisions.length > 0} jump="exec-decisions" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section id="exec-decisions" className={CARD} style={cardStyle}>
          <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Decisions waiting on the Group</h2><span className="text-[12px] text-[var(--ink4)]">by staleness</span></div>
          <div className="flex flex-col">
            {decisions.length === 0 ? <span className="text-[12px] text-[var(--ink4)]">No decisions pending.</span> : decisions.map((p) => (
              <div key={p.id} className="grid grid-cols-[14px_1fr_auto] items-start gap-3 border-t border-[var(--hair)] py-2.5 first:border-t-0 first:pt-0">
                <span className="mt-1.5 size-2.5 rounded-sm" style={{ background: p.calculated === "R" ? "var(--bad)" : "var(--warn)" }} />
                <div className="min-w-0"><b className="block font-semibold text-[var(--qink)]">{p.name}</b><span className="text-[13px] text-[var(--ink3)]">{p.risks[0]?.title ?? (p.targetPassed ? "Target passed; reported greener than calculated" : "At risk")}</span></div>
                <button data-open={p.id} className="whitespace-nowrap rounded bg-[var(--wash2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink2)]">{p.freshnessDays > 90 ? "no update" : `${p.freshnessDays}d`}</button>
              </div>
            ))}
          </div>
        </section>
        <section className={CARD} style={cardStyle}>
          <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Pipeline at a glance</h2></div>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1.5 text-[12px]">
            {buckets.map((b) => (
              <div key={b.c} className="contents">
                <span className="text-[var(--ink2)]">{b.c}</span>
                <span className="h-4 overflow-hidden rounded bg-[var(--wash2)]"><i className="block h-full rounded" style={{ width: `${(b.n / maxB) * 100}%`, background: bcol[b.c] }} /></span>
                <span className="text-right font-semibold num text-[var(--qink)]">{b.n}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Approved portfolio — status</h2><span className="text-[12px] text-[var(--ink4)]">{approved.length} funded · red first</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink4)]">
                <th className="px-2.5 py-2">Solution</th><th className="px-2.5 py-2">RAG</th><th className="px-2.5 py-2">Dimensions</th><th className="px-2.5 py-2">%</th><th className="px-2.5 py-2">PM</th>
              </tr>
            </thead>
            <tbody>
              {table.length === 0 ? <tr><td colSpan={5} className="px-2.5 py-3 text-[var(--ink4)]">No approved-portfolio projects yet.</td></tr> : table.map((p) => (
                <tr key={p.id} data-open={p.id} className="cursor-pointer border-t border-[var(--hair)] hover:bg-[var(--wash2)]">
                  <td className="px-2.5 py-2"><span className="font-semibold text-[var(--qink)]">{p.name}</span><span className="block text-[12px] text-[var(--ink4)]">{p.desc}</span></td>
                  <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><RagChip rag={p.calculated} /><DisputeGap p={p} /></span></td>
                  <td className="px-2.5 py-2"><DimensionSquares p={p} /></td>
                  <td className="px-2.5 py-2 num">{p.pct}%</td>
                  <td className="px-2.5 py-2 text-[var(--ink3)]">{p.pmName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={CARD} style={cardStyle}>
          <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Reported RAG trend · 8 weeks</h2></div>
          {data.trend.series.length ? <RagTrend series={data.trend.series} weeks={data.trend.weeks} title="Projects by reported RAG" /> : <span className="text-[12px] text-[var(--ink4)]">Trend builds as nightly snapshots accrue.</span>}
        </section>
        <section className={CARD} style={cardStyle}>
          <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Top risks</h2></div>
          <RiskList risks={risks as CockpitProject["risks"]} />
        </section>
      </div>
    </div>
  );
}
