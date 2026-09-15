import { Folder, Clock, CalendarDays, Flag, ShieldAlert, Gauge, type LucideIcon } from "lucide-react";
import type { CockpitData, CockpitProject, GateKey } from "@/server/dashboard-cockpit";
import { calcRagCounts, CALC_ORDER, GATE_KEYS } from "@/server/dashboard-cockpit";
import { DisputeGap, Freshness, RagChip, MarketMatrix } from "./primitives";
import { AskQBrief } from "./ask-q-brief";
import { PmWorkQueue, type PmQueueItem } from "./pm-work-queue";

// The Project Manager cockpit, matching the approved design: daily-brief gradient card +
// six KPI tiles, a section sidebar, RAG-tinted project cards (phase · stage · %), a
// filterable work queue with actions, and the Projects At Risk panel.

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;

const STAGE_OF: Record<GateKey, { phase: string; stage: string }> = {
  brd: { phase: "Planning", stage: "BRD" },
  proto: { phase: "Planning", stage: "Prototype" },
  mvp1: { phase: "Execution", stage: "Build / MVP1" },
  sit: { phase: "Execution", stage: "SIT" },
  uat: { phase: "Execution", stage: "UAT" },
  golive: { phase: "Transition", stage: "Go-Live" },
};

function stageOf(p: CockpitProject): { phase: string; stage: string } {
  for (const k of GATE_KEYS) {
    if (p.gates[k] !== "done") return STAGE_OF[k];
  }
  return { phase: "Closure", stage: "Production" };
}

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";

function buildQueue(mine: CockpitProject[], now: Date): PmQueueItem[] {
  const q: PmQueueItem[] = [];
  for (const p of mine) {
    const ms = p.nextMilestone;
    if (ms?.dueDate) {
      const days = Math.round((new Date(ms.dueDate).getTime() - now.getTime()) / 86_400_000);
      if (days < 0)
        q.push({ kind: "due", title: `${ms.name} overdue by ${-days}d`, detail: "Milestone passed without closure — re-baseline or record the reason.", when: "Overdue", action: "Re-baseline", projectId: p.id, projectName: p.name });
      else if (days <= 7)
        q.push({ kind: "soon", title: ms.name, detail: `${stageOf(p).stage} · gate deliverables due`, when: days === 0 ? "Today" : `in ${days}d`, action: "Open", projectId: p.id, projectName: p.name });
    }
    if (p.dispute)
      q.push({ kind: "flag", title: `Reported ${p.reported} but calculates ${p.calculated}`, detail: "Revise the rating or add justification before the weekly report.", when: "Before report", action: "Review RAG", projectId: p.id, projectName: p.name });
    if (p.redRisks > 0)
      q.push({ kind: "due", title: p.risks.find((r) => r.severity === "R")?.title ?? `${p.redRisks} red risk(s) open`, detail: `Owner: ${p.risks.find((r) => r.severity === "R")?.owner ?? "—"}. No acknowledgement recorded.`, when: "Unacknowledged", action: "Escalate", projectId: p.id, projectName: p.name });
    if (p.freshnessDays > 7 && p.freshnessDays < 900)
      q.push({ kind: "info", title: "Weekly status update due", detail: `Last update ${p.freshnessDays} days ago.`, when: "This week", action: "Update", projectId: p.id, projectName: p.name });
  }
  const order = { due: 0, soon: 1, flag: 2, info: 3 };
  return q.sort((a, b) => order[a.kind] - order[b.kind]);
}

function KpiTile({ icon: Icon, value, label, sub, hot, bar }: { icon: LucideIcon; value: React.ReactNode; label: string; sub?: string; hot?: boolean; bar?: { pct: number; over?: boolean } }) {
  return (
    <div className={CARD} style={cardStyle}>
      <span className="mb-2 grid size-8 place-items-center rounded-lg" style={{ background: hot ? "var(--badbg)" : "var(--brand-light)", color: hot ? "var(--bad)" : "var(--brand)" }}>
        <Icon className="size-4" />
      </span>
      <div className="text-[24px] font-semibold leading-none tracking-tight" style={{ color: hot ? "var(--bad)" : "var(--qink)" }}>{value}</div>
      <div className="mt-1 text-[12px] text-[var(--ink2)]">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--ink4)]">{sub}</div>}
      {bar && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--wash2)]">
          <i className="block h-full rounded-full" style={{ width: `${Math.min(bar.pct, 130) / 1.3}%`, background: bar.over ? "var(--bad)" : "var(--warn)" }} />
        </div>
      )}
    </div>
  );
}

function PmProjectCard({ p }: { p: CockpitProject }) {
  const { phase, stage } = stageOf(p);
  const tint =
    p.calculated === "R" ? "color-mix(in oklab, var(--bad) 9%, var(--cardbg))"
    : p.calculated === "A" ? "color-mix(in oklab, var(--warn) 9%, var(--cardbg))"
    : "var(--cardbg)";
  return (
    <button
      data-open={p.id}
      className="cockpit-card flex min-w-0 flex-col gap-2 rounded-[12px] border border-[var(--cardbd)] p-3.5 text-left"
      style={{ background: tint }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 flex-none place-items-center rounded-md bg-[var(--wash2)] text-[var(--ink3)]"><Folder className="size-3.5" /></span>
          <b className="truncate text-[14px] font-semibold text-[var(--qink)]">{p.name}</b>
        </span>
        <RagChip rag={p.calculated} />
      </div>
      <div className="text-[12.5px] text-[var(--ink2)]"><b className="font-semibold text-[var(--qink)]">{phase}</b> · {stage} · {p.pct}%</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: "var(--wash2)", color: "var(--ink3)" }}>{p.category === "Approved" ? "Approved" : p.category === "Unfiled" ? "Unfiled" : p.category}</span>
        {p.dispute ? (
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--bad)" }}>
            ⚠ RAG Alert <span className="rounded px-1 py-px text-[10px]" style={{ background: "var(--badbg)" }}>{p.reported} → {p.calculated}</span>
          </span>
        ) : (
          <span className="font-semibold" style={{ color: "var(--ok)" }}>✓ RAG Agrees</span>
        )}
      </div>
      <div className="text-[12px] text-[var(--ink3)]">
        {p.nextMilestone ? <>{p.nextMilestone.name} · <b className="font-semibold" style={{ color: p.nextMilestone.overdue ? "var(--bad)" : "var(--qink)" }}>{fmt(p.nextMilestone.dueDate)}</b></> : "no milestone set"}
      </div>
      <div className="text-[11.5px] text-[var(--ink4)]">Last Updated: {p.freshnessDays > 90 ? "—" : `${p.freshnessDays}d ago`}</div>
    </button>
  );
}

const NAV = [
  { label: "Overview", href: "#pm-top" },
  { label: "My Projects", href: "#pm-projects" },
  { label: "Work Queue", href: "#pm-queue" },
  { label: "Risks & Collisions", href: "#pm-risks" },
];

export function PmCockpit({ data, viewerId, viewerName, allocationPct, now }: { data: CockpitData; viewerId: string; viewerName?: string; allocationPct?: number | null; now: Date }) {
  const owned = data.projects.filter((p) => p.pmId === viewerId && !["Completed", "Cancelled"].includes(p.status));
  const previewingAll = owned.length === 0;
  const mine = (previewingAll ? data.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status)) : owned)
    .slice()
    .sort((a, b) => CALC_ORDER[a.calculated] - CALC_ORDER[b.calculated]);

  const counts = calcRagCounts(mine);
  const queue = buildQueue(mine, now);
  const overdueMs = mine.filter((p) => p.nextMilestone?.overdue).length;
  const upcoming = mine
    .filter((p) => p.nextMilestone?.dueDate && !p.nextMilestone.overdue)
    .sort((a, b) => new Date(a.nextMilestone!.dueDate!).getTime() - new Date(b.nextMilestone!.dueDate!).getTime());
  const soon = upcoming.filter((p) => (new Date(p.nextMilestone!.dueDate!).getTime() - now.getTime()) / 86_400_000 <= 7).length;
  const disputes = mine.filter((p) => p.dispute).length;
  const openRisks = mine.reduce((n, p) => n + p.risks.length, 0);
  const risks = mine.flatMap((p) => p.risks.map((r) => ({ ...r, projectName: p.name }))).sort((a, b) => (a.severity === "R" ? 0 : 1) - (b.severity === "R" ? 0 : 1)).slice(0, 8);
  const rollout = mine.find((p) => p.markets.length > 0);
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div id="pm-top" className="flex flex-col gap-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink4)]">{today} · Africa/Nairobi</div>
        <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--qink)]">My Projects</h1>
        <p className="mt-1 text-[14px] text-[var(--ink2)]">
          {viewerName ?? "You"} · Project Manager · {mine.length} project{mine.length === 1 ? "" : "s"} {previewingAll ? "(previewing all — you lead none)" : "owned"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[170px_minmax(0,1.15fr)_minmax(0,1fr)]">
        <nav className="hidden flex-col gap-1 self-start rounded-[14px] border border-[var(--cardbd)] p-2 lg:flex" style={cardStyle} aria-label="Sections">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-[13px] font-medium"
              style={i === 0 ? { background: "var(--brand-light)", color: "var(--brand)", fontWeight: 600 } : { color: "var(--ink2)" }}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <AskQBrief level="pm" data={data} viewerId={viewerId} daily signee={viewerName} />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <KpiTile icon={Folder} value={mine.length} label="Projects owned" bar={{ pct: Math.min(counts.G / Math.max(mine.length, 1), 1) * 130 }} />
          <KpiTile icon={Clock} value={overdueMs} label="Overdue milestones" hot={overdueMs > 0} />
          <KpiTile icon={CalendarDays} value={soon} label="Gates & milestones ≤7d" sub={upcoming[0]?.nextMilestone ? `next: ${upcoming[0].nextMilestone.name}` : undefined} />
          <KpiTile icon={Flag} value={disputes} label="RAG disputes" sub="reported greener" hot={disputes > 0} />
          <KpiTile icon={ShieldAlert} value={openRisks} label="Open risks" sub="needing attention" />
          {allocationPct != null && (
            <KpiTile icon={Gauge} value={`${allocationPct}%`} label="My allocation" hot={allocationPct > 100} bar={{ pct: allocationPct, over: allocationPct > 100 }} />
          )}
        </div>
      </div>

      <section id="pm-projects" className={CARD} style={cardStyle}>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--qink)]">My Projects</h2>
          <span className="text-[12px] text-[var(--ink4)]">Click a card for the status-report view</span>
        </div>
        <div className="mb-3 flex gap-3 text-[11.5px] text-[var(--ink3)]">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: "var(--ok)" }} />On track</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: "var(--warn)" }} />Needs attention</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: "var(--bad)" }} />At risk</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(235px,1fr))] gap-3">
          {mine.map((p) => <PmProjectCard key={p.id} p={p} />)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <PmWorkQueue items={queue} />
        <section id="pm-risks" className={`${CARD} self-start`} style={cardStyle}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qink)]">Projects At Risk</h2>
            <span className="text-[12px] text-[var(--ink4)]">by severity</span>
          </div>
          <div className="flex flex-col gap-3">
            {risks.length === 0 ? <span className="text-[12px] text-[var(--ink4)]">No open risks</span> : risks.map((r, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2.5 text-[13px]">
                <span className="mt-1.5 size-2 rounded-full" style={{ background: r.severity === "R" ? "var(--bad)" : "var(--warn)" }} />
                <div><b className="block font-semibold leading-snug text-[var(--qink)]">{r.title}</b><span className="text-[12px] text-[var(--ink3)]">{r.id} · owner {r.owner}</span></div>
                <span className="whitespace-nowrap text-right text-[12px] text-[var(--ink4)]">{r.projectName}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {rollout && (
        <section data-secondary className={CARD} style={cardStyle}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qink)]">{rollout.name} — market rollout</h2>
            <span className="flex items-center gap-2 text-[12px] text-[var(--ink4)]"><Freshness days={rollout.freshnessDays} /><DisputeGap p={rollout} /></span>
          </div>
          <MarketMatrix markets={rollout.markets} />
        </section>
      )}
    </div>
  );
}
