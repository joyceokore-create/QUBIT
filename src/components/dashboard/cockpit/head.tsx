import type { CockpitData, CockpitProject } from "@/server/dashboard-cockpit";
import { calcRagCounts, CALC_ORDER } from "@/server/dashboard-cockpit";
import { Tile, RagBar, RagChip, DisputeGap, Freshness, RagTrend } from "./primitives";
import { CockpitPageHead } from "./page-head";
import { AskQBrief } from "./ask-q-brief";

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;

export function HeadCockpit({ data }: { data: CockpitData }) {
  const active = data.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const disputes = active.filter((p) => p.dispute);
  const stale = active.filter((p) => p.freshnessDays > 7 && p.freshnessDays < 900).sort((a, b) => b.freshnessDays - a.freshnessDays);
  const escalate = active.filter((p) => p.redRisks > 0 || p.targetPassed);
  const counts = calcRagCounts(active);

  const pmCards = data.pms.map((pm) => {
    const mine = active.filter((p) => p.pmId === pm.id);
    const cc = calcRagCounts(mine);
    return { pm, mine, cc, disputes: mine.filter((p) => p.dispute).length, onTime: mine.filter((p) => p.freshnessDays <= 7).length };
  });

  const tracker = active.slice().sort((a, b) => CALC_ORDER[a.calculated] - CALC_ORDER[b.calculated] || b.freshnessDays - a.freshnessDays);

  return (
    <div className="flex flex-col gap-5">
      <CockpitPageHead
        title="Head of PMs — supervision & escalation"
        subtitle={`${active.length} active initiatives across ${data.pms.length} PMs. Exceptions first: disputes, stale reporting, and what needs escalating upward.`}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile value={active.length} label="Active initiatives" detail={`${counts.R} red · ${counts.A} amber · ${counts.G} green`}><RagBar counts={counts} /></Tile>
        <Tile value={disputes.length} label="RAG disputes" detail="reported greener than calculated" hot={disputes.length > 0} jump="head-disputes" />
        <Tile value={stale.length} label="Stale status updates" detail={`${stale.filter((p) => p.freshnessDays > 14).length} older than 14 days`} hot={stale.some((p) => p.freshnessDays > 14)} jump="head-stale" />
        <Tile value={escalate.length} label="To escalate upward" detail="red risks / passed targets" jump="head-escal" />
      </div>

      <AskQBrief level="head" data={data} viewerId="" />

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">By project manager</h2><span className="text-[12px] text-[var(--ink4)]">Click a PM to open their view</span></div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {pmCards.map(({ pm, mine, cc, disputes: d, onTime }) => (
            <button key={pm.id} data-pm={pm.id} className={`${CARD} flex flex-col gap-2 text-left`} style={cardStyle}>
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-[var(--brand-light)] text-[11px] font-bold text-[var(--brand)]">{pm.name.slice(0, 2).toUpperCase()}</span>
                <b className="font-semibold text-[var(--qink)]">{pm.name}</b>
              </div>
              <RagBar counts={cc} />
              <div className="grid grid-cols-[1fr_auto] gap-y-0.5 text-[12px] text-[var(--ink3)]">
                <span>Projects</span><b className="text-right text-[var(--qink)]">{mine.length}</b>
                <span>Red / amber</span><b className="text-right text-[var(--qink)]">{cc.R} / {cc.A}</b>
                <span>Updates on time</span><b className="text-right text-[var(--qink)]">{onTime}/{mine.length}</b>
                <span>RAG disputes</span><b className="text-right text-[var(--qink)]">{d}</b>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel id="head-disputes" title="RAG disputes" sub="reported vs calculated">
          {disputes.length === 0 ? <Empty>No disputes — reported matches calculated.</Empty> : disputes.map((p) => (
            <QueueRow key={p.id} p={p} color="var(--brand)" line={<>reported {p.reported} · calculates {p.calculated}</>} />
          ))}
        </Panel>
        <Panel id="head-stale" title="Reporting compliance" sub="weekly update expected">
          {stale.length === 0 ? <Empty>Everyone is current.</Empty> : stale.map((p) => (
            <QueueRow key={p.id} p={p} color={p.freshnessDays > 14 ? "var(--bad)" : "var(--warn)"} line={<Freshness days={p.freshnessDays} />} />
          ))}
        </Panel>
        <Panel id="head-escal" title="Escalate upward" sub="red risks / passed targets">
          {escalate.length === 0 ? <Empty>Nothing to escalate.</Empty> : escalate.map((p) => (
            <QueueRow key={p.id} p={p} color="var(--bad)" line={<>{p.redRisks > 0 ? `${p.redRisks} red risk(s)` : ""}{p.targetPassed ? (p.redRisks > 0 ? " · target passed" : "target passed") : ""}</>} />
          ))}
        </Panel>
        <section className={CARD} style={cardStyle}>
          <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Reported RAG · active portfolio · 8 weeks</h2></div>
          {data.trend.series.length ? <RagTrend series={data.trend.series} weeks={data.trend.weeks} title="Projects by reported RAG" /> : <Empty>Trend builds as nightly snapshots accrue.</Empty>}
        </section>
      </div>

      <section className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Delivery tracker</h2><span className="text-[12px] text-[var(--ink4)]">red first</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink4)]">
                <th className="px-2.5 py-2">Project</th><th className="px-2.5 py-2">PM</th><th className="px-2.5 py-2">Status</th><th className="px-2.5 py-2">%</th><th className="px-2.5 py-2">RAG</th><th className="px-2.5 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tracker.map((p) => (
                <tr key={p.id} data-open={p.id} className="cursor-pointer border-t border-[var(--hair)] hover:bg-[var(--wash2)]">
                  <td className="px-2.5 py-2"><span className="font-semibold text-[var(--qink)]">{p.name}</span></td>
                  <td className="px-2.5 py-2 text-[var(--ink3)]">{p.pmName ?? "—"}</td>
                  <td className="px-2.5 py-2 text-[var(--ink2)]">{p.status}</td>
                  <td className="px-2.5 py-2 num">{p.pct}%</td>
                  <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><RagChip rag={p.calculated} /><DisputeGap p={p} /></span></td>
                  <td className="px-2.5 py-2"><Freshness days={p.freshnessDays} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Panel({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={CARD} style={cardStyle}>
      <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">{title}</h2>{sub && <span className="text-[12px] text-[var(--ink4)]">{sub}</span>}</div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
function QueueRow({ p, color, line }: { p: CockpitProject; color: string; line: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[14px_1fr_auto] items-start gap-3 border-t border-[var(--hair)] py-2.5 first:border-t-0 first:pt-0">
      <span className="mt-1.5 size-2.5 rounded-sm" style={{ background: color }} />
      <div className="min-w-0"><b className="block font-semibold text-[var(--qink)]">{p.name}</b><span className="text-[13px] text-[var(--ink3)]">{line}</span></div>
      <button data-open={p.id} className="rounded bg-[var(--wash2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink2)]">Open</button>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] text-[var(--ink4)]">{children}</span>;
}
