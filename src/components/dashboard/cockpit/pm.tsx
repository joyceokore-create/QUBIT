import type { CockpitData, CockpitProject } from "@/server/dashboard-cockpit";
import { calcRagCounts, CALC_ORDER } from "@/server/dashboard-cockpit";
import { Tile, RagBar, ProjectStripCard, RiskList, DisputeGap, Freshness } from "./primitives";
import { CockpitPageHead } from "./page-head";
import { AskQBrief } from "./ask-q-brief";

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;

interface QueueItem { kind: "due" | "soon" | "flag" | "info"; title: string; detail: string; project: CockpitProject; when: string }

function buildQueue(mine: CockpitProject[], now: Date): QueueItem[] {
  const q: QueueItem[] = [];
  for (const p of mine) {
    const ms = p.nextMilestone;
    if (ms?.dueDate) {
      const days = Math.round((new Date(ms.dueDate).getTime() - now.getTime()) / 86_400_000);
      if (days < 0) q.push({ kind: "due", title: `${ms.name} overdue by ${-days}d`, detail: "Milestone passed without closure — re-baseline or record the reason.", project: p, when: "Overdue" });
      else if (days <= 7) q.push({ kind: "soon", title: ms.name, detail: `${p.status} · milestone due`, project: p, when: days === 0 ? "Today" : `in ${days}d` });
    }
    if (p.dispute) q.push({ kind: "flag", title: `Reported ${p.reported} but calculates ${p.calculated}`, detail: "Revise the rating or add justification before the weekly report.", project: p, when: "Before report" });
    if (p.redRisks > 0) q.push({ kind: "due", title: `${p.redRisks} red risk${p.redRisks > 1 ? "s" : ""} open`, detail: p.risks.find((r) => r.severity === "R")?.title ?? "", project: p, when: "Unresolved" });
    if (p.freshnessDays > 7 && p.freshnessDays < 900) q.push({ kind: "info", title: "Weekly status update due", detail: `Last update ${p.freshnessDays} days ago.`, project: p, when: "This week" });
  }
  const order = { due: 0, soon: 1, flag: 2, info: 3 };
  return q.sort((a, b) => order[a.kind] - order[b.kind]);
}

const KIND_COLOR = { due: "var(--bad)", soon: "var(--warn)", flag: "var(--brand)", info: "var(--ink4)" };

export function PmCockpit({ data, viewerId, now }: { data: CockpitData; viewerId: string; now: Date }) {
  const owned = data.projects.filter((p) => p.pmId === viewerId && !["Completed", "Cancelled"].includes(p.status));
  const previewingAll = owned.length === 0;
  const mine = (previewingAll ? data.projects : owned).slice().sort((a, b) => CALC_ORDER[a.calculated] - CALC_ORDER[b.calculated]);
  const counts = calcRagCounts(mine);
  const queue = buildQueue(mine, now);
  const disputes = mine.filter((p) => p.dispute).length;
  const dueNow = queue.filter((q) => q.kind === "due").length;
  const risks = mine.flatMap((p) => p.risks.map((r) => ({ ...r, projectName: p.name }))).sort((a, b) => (a.severity === "R" ? 0 : 1) - (b.severity === "R" ? 0 : 1)).slice(0, 6);
  const rollout = mine.find((p) => p.markets.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <CockpitPageHead
        title="My projects"
        subtitle={`${mine.length} project${mine.length === 1 ? "" : "s"}${previewingAll ? " (previewing all — you lead none)" : " owned"}. Red first, then nearest gate. Actions merge into one queue.`}
      />

      <div className="grid grid-cols-3 gap-3">
        <Tile value={mine.length} label="Projects owned" detail={`${counts.R} red · ${counts.A} amber`}><RagBar counts={counts} /></Tile>
        <Tile value={dueNow} label="Overdue / unresolved" detail="need action" hot={dueNow > 0} />
        <Tile value={disputes} label="RAG disputes" detail="reported greener" />
      </div>

      <AskQBrief level="pm" data={data} viewerId={viewerId} />

      {/* Lead: what to do next. */}
      <section id="pm-queue" className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Work queue</h2><span className="text-[12px] text-[var(--ink4)]">{queue.length} items</span></div>
        <div className="flex flex-col">
          {queue.length === 0 && <span className="text-[12px] text-[var(--ink4)]">Nothing needs action — nice.</span>}
          {queue.map((q, i) => (
            <div key={i} className="grid grid-cols-[14px_1fr_auto] items-start gap-3 border-t border-[var(--hair)] py-2.5 first:border-t-0 first:pt-0">
              <span className="mt-1.5 size-2.5 rounded-sm" style={{ background: KIND_COLOR[q.kind] }} />
              <div className="min-w-0"><b className="block font-semibold text-[var(--qink)]">{q.title}</b><span className="text-[13px] text-[var(--ink3)]">{q.detail}</span></div>
              <div className="flex flex-col items-end gap-1 whitespace-nowrap text-[12px] text-[var(--ink4)]">
                <button data-open={q.project.id} className="rounded bg-[var(--wash2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink2)]">{q.project.name}</button>
                <span>{q.when}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section data-secondary className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">All my projects</h2><span className="text-[12px] text-[var(--ink4)]">click a card for detail</span></div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {mine.map((p) => <div key={p.id} className="cockpit-card"><ProjectStripCard p={p} /></div>)}
        </div>
      </section>

      <section data-secondary className={CARD} style={cardStyle}>
        <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">Top risks on my projects</h2></div>
        <RiskList risks={risks} />
      </section>

      {rollout && (
        <section data-secondary className={CARD} style={cardStyle}>
          <div className="mb-3"><h2 className="text-[15px] font-semibold text-[var(--qink)]">{rollout.name} — market rollout</h2></div>
          <div className="flex items-center gap-2 text-[13px] text-[var(--ink3)]"><Freshness days={rollout.freshnessDays} /><DisputeGap p={rollout} /></div>
        </section>
      )}
    </div>
  );
}
