import type { CockpitData, CockpitProject } from "@/server/dashboard-cockpit";
import { calcRagCounts, CALC_ORDER } from "@/server/dashboard-cockpit";
import { GATE_KEYS, GATE_LABELS } from "@/server/dashboard-cockpit";
import { Tile, RagBar, RagChip, DisputeGap, Freshness, RagTrend, GateCell } from "./primitives";
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

  // Resource conflicts, derived from real data: PMs carrying 3+ red/amber projects, and PMs
  // with two projects whose next gate falls in the same week.
  const conflicts: { severity: "R" | "A"; title: string; detail: string; who: string }[] = [];
  for (const pm of data.pms) {
    const mine = active.filter((p) => p.pmId === pm.id);
    const trouble = mine.filter((p) => p.calculated !== "G");
    if (trouble.length >= 3) {
      conflicts.push({ severity: "A", title: `${pm.name} carries ${trouble.length} red/amber projects`, detail: trouble.slice(0, 3).map((p) => p.name).join(", "), who: `${pm.name} · ${mine.length} projects` });
    }
    const dated = mine.filter((p) => p.nextMilestone?.dueDate);
    for (let i = 0; i < dated.length; i++) {
      for (let j = i + 1; j < dated.length; j++) {
        const da = new Date(dated[i].nextMilestone!.dueDate!).getTime();
        const db = new Date(dated[j].nextMilestone!.dueDate!).getTime();
        if (Math.abs(da - db) <= 7 * 86_400_000) {
          conflicts.push({ severity: "R", title: `${dated[i].name} and ${dated[j].name} have gates in the same week`, detail: `Both under ${pm.name} — one may slip.`, who: pm.name });
        }
      }
    }
  }
  const topConflicts = conflicts.slice(0, 6);

  // Merged exceptions — the Head's one focus. Priority: escalate → dispute → stale.
  const exceptions: { p: CockpitProject; color: string; line: string }[] = [
    ...escalate.map((p) => ({ p, color: "var(--bad)", line: `${p.redRisks > 0 ? `${p.redRisks} red risk(s)` : ""}${p.targetPassed ? (p.redRisks > 0 ? " · target passed" : "Target passed") : ""}`.trim() || "Needs escalation" })),
    ...disputes.map((p) => ({ p, color: "var(--brand)", line: `Reported ${p.reported}, calculates ${p.calculated}` })),
    ...stale.map((p) => ({ p, color: p.freshnessDays > 14 ? "var(--bad)" : "var(--warn)", line: `No update in ${p.freshnessDays}d` })),
  ].slice(0, 14);

  return (
    <div className="flex flex-col gap-5">
      <CockpitPageHead
        title="Head of PMs — supervision & escalation"
        subtitle={`${active.length} active initiatives across ${data.pms.length} PMs. Exceptions first: disputes, stale reporting, and what needs escalating upward.`}
      />

      <div className="grid grid-cols-3 gap-3">
        <Tile value={active.length} label="Active initiatives" detail={`${counts.R} red · ${counts.A} amber`}><RagBar counts={counts} /></Tile>
        <Tile value={disputes.length} label="RAG disputes" detail="reported greener" hot={disputes.length > 0} />
        <Tile value={stale.length} label="Stale updates" detail={`${stale.filter((p) => p.freshnessDays > 14).length} over 14 days`} hot={stale.some((p) => p.freshnessDays > 14)} />
      </div>

      <AskQBrief level="head" data={data} viewerId="" />

      {/* Lead: everything off-track, one prioritized list (escalate → dispute → stale). */}
      <section id="head-exceptions" className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Exceptions</h2><span className="text-[12px] text-[var(--ink4)]">{exceptions.length} items · needs your attention</span></div>
        <div className="flex flex-col">
          {exceptions.length === 0 ? <Empty>Nothing off-track — no disputes, stale updates or escalations.</Empty> : exceptions.map((x, i) => (
            <QueueRow key={i} p={x.p} color={x.color} line={x.line} />
          ))}
        </div>
      </section>

      <section data-secondary>
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

      <section data-secondary id="head-tracker" className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Stage-gate tracker</h2><span className="text-[12px] text-[var(--ink4)]">gates derived from % complete · red first</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink4)]">
                <th className="px-2.5 py-2">Project</th><th className="px-2.5 py-2">PM</th>
                {GATE_KEYS.map((k) => <th key={k} className="px-1 py-2 text-center">{GATE_LABELS[k]}</th>)}
                <th className="px-2.5 py-2">%</th><th className="px-2.5 py-2">RAG</th><th className="px-2.5 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tracker.map((p) => (
                <tr key={p.id} data-open={p.id} className="cursor-pointer border-t border-[var(--hair)] hover:bg-[var(--wash2)]">
                  <td className="px-2.5 py-2"><span className="font-semibold text-[var(--qink)]">{p.name}</span></td>
                  <td className="px-2.5 py-2 text-[var(--ink3)]">{p.pmName ?? "—"}</td>
                  {GATE_KEYS.map((k) => <td key={k} className="px-1 py-2 text-center"><GateCell state={p.gates[k]} /></td>)}
                  <td className="px-2.5 py-2 num">{p.pct}%</td>
                  <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><RagChip rag={p.calculated} /><DisputeGap p={p} /></span></td>
                  <td className="px-2.5 py-2"><Freshness days={p.freshnessDays} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3 text-[12px] text-[var(--ink3)]">
          <span className="inline-flex items-center gap-1.5"><GateCell state="done" /> Complete</span>
          <span className="inline-flex items-center gap-1.5"><GateCell state="prog" /> In progress</span>
          <span className="inline-flex items-center gap-1.5"><GateCell state="late" /> Delayed</span>
          <span className="inline-flex items-center gap-1.5"><GateCell state="block" /> Blocked</span>
          <span className="inline-flex items-center gap-1.5"><GateCell state="none" /> Not started</span>
        </div>
      </section>

      <section data-secondary className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Resource conflicts</h2><span className="text-[12px] text-[var(--ink4)]">next 4 weeks · derived from load & gate dates</span></div>
        <div className="flex flex-col gap-2">
          {topConflicts.length === 0 ? <Empty>No load or gate-date conflicts detected.</Empty> : topConflicts.map((c, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2.5 text-[13px]">
              <span className="mt-1.5 size-2 rounded-full" style={{ background: c.severity === "R" ? "var(--bad)" : "var(--warn)" }} />
              <div><b className="block font-semibold text-[var(--qink)]">{c.title}</b><span className="text-[12px] text-[var(--ink3)]">{c.detail}</span></div>
              <span className="whitespace-nowrap text-[12px] text-[var(--ink4)]">{c.who}</span>
            </div>
          ))}
        </div>
      </section>

      <section data-secondary className={CARD} style={cardStyle}>
        <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Reported RAG · active portfolio</h2></div>
        {data.trend.series.length ? <RagTrend series={data.trend.series} weeks={data.trend.weeks} title="Projects by reported RAG" /> : <Empty>Trend builds as nightly snapshots accrue.</Empty>}
      </section>
    </div>
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
