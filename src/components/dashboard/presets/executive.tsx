import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus } from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { DecisionQueueRow, ExecutiveDashboard, HeadQueueRow } from "@/server/dashboard-exec";
import { RollupStrip } from "@/components/dashboard/rollup-strip";
import { groupSectionsByCategory } from "@/server/pipeline";
import { Sparkline } from "@/components/dashboard/sparkline";
import { NeedsAttentionList } from "@/components/dashboard/needs-attention";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { CARD, ChangedSection, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// Executive preset v4 (amended docs/18 §6): hero + decision queue → one collapsible
// section per portfolio, worst health first (per-project stat chips replaced the global
// KPI strip, 18 §0 decision №1; the section headers' RAG+Δ replaced the org heatmap).
// The rollout heatmap returns per-portfolio with M-D's market tracks.

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

// DM1.73 (T1): the PortfolioCards grid is gone — it rendered the SAME portfolios as
// PortfolioSections below, twice on one page. The sections (with RAG+Δ headers) stay.

/** docs/32 M-W1b — Head of PMs only: this week's check-in state per active project.
 * Review-only; the approve step arrives with the Head roll-up (PortfolioReport, P3). */
function HeadQueue({ rows, awaiting }: { rows: HeadQueueRow[]; awaiting: boolean }) {
  // M-D2: the dashboard shows the SHAPE of the week, not 30-odd rows. The per-project
  // queue lives on the reports page, grouped by portfolio — one place to work through
  // them instead of an endless list wedged between the exec's other panels.
  const confirmed = rows.filter((r) => r.checkIn === "Confirmed").length;
  const unconfirmed = rows.length - confirmed;
  const kpis = [
    { n: confirmed, label: "PM check-ins in", tok: "--ok" },
    { n: unconfirmed, label: "Unconfirmed", tok: "--warn" },
    { n: rows.filter((r) => r.status === "Overdue" || r.status === "AtRisk").length, label: "Red/amber projects", tok: "--bad" },
    { n: awaiting ? 1 : 0, label: "Awaiting my approval", tok: "--qinfo", note: awaiting ? "this week's roll-up" : "all signed" },
  ];
  return (
    <Panel title="PM check-ins this week" sub={`${unconfirmed} NOT CONFIRMED`}>
      <div className="grid grid-cols-2 gap-2.5 p-[10px_16px_2px] sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[10px] border border-[var(--w08)] p-2.5">
            <div className="text-[20px] font-bold tracking-[-0.6px]" style={{ color: `var(${k.tok})` }}>{k.n}</div>
            <div className="font-mono text-[8.5px] font-bold uppercase tracking-[.8px] text-[var(--ink4)]">{k.label}</div>
            {"note" in k && k.note && <div className="mt-0.5 text-[9px] text-[var(--ink5)]">{k.note}</div>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 p-[10px_16px_14px]">
        <Link
          href="/reports?tab=checkins"
          className="flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)]"
        >
          Work through the {rows.length} project check-ins <ArrowRight className="size-3" />
        </Link>
        <span className="text-[11px] text-[var(--ink4)]">grouped by portfolio on the reports page</span>
      </div>
    </Panel>
  );
}

export function ExecutivePreset({ d, firstName }: { d: ExecutiveDashboard; firstName: string }) {
  const grouped = groupSectionsByCategory(d.sections);
  return (
    <>
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <ExecHero d={d} firstName={firstName} />
        <HealthTrendCard d={d} />
      </section>
      {d.approvedRollup?.narrative && (
        <section className={`${CARD} flex flex-wrap items-center gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
          <span className="rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[1px]" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
            Week {d.approvedRollup.isoWeek.split("-W")[1]} roll-up · approved
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-[var(--ink2)]">“{d.approvedRollup.narrative}”</span>
          {d.approvedRollup.approvedByName && (
            <span className="font-mono text-[9.5px] text-[var(--ink4)]">— {d.approvedRollup.approvedByName}, Head of PMs</span>
          )}
          {/* DM1.73 (T2): the signed line carries its denominator — coverage + when. */}
          <span className="w-full font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)]">
            {d.approvedRollup.confirmed} of {d.approvedRollup.total} check-ins confirmed
            {d.approvedRollup.approvedAt &&
              ` · approved ${d.approvedRollup.approvedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
          </span>
        </section>
      )}
      {d.headQueue && <HeadQueue rows={d.headQueue} awaiting={d.rollup?.status === "Draft"} />}
      {d.headQueue && d.rollup && <RollupStrip rollup={d.rollup} />}
      <DecisionQueue d={d} />
      {/* Amended docs/18 §6 + docs/32 M-W1b: portfolio-grouped sections ARE the projects
          view, now under the business-pipeline headers (Approved → Exploring → Shelved),
          worst health first within a group; Unassigned last in Approved. */}
      {grouped.map((g) => (
        <section key={g.category}>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-[var(--qink)]">
            {g.category}
            <span className="rounded-full border border-[var(--w08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink4)]">
              {g.data.sections.length}
            </span>
          </h2>
          <PortfolioSections data={g.data} matrices={d.rolloutMatrices} />
        </section>
      ))}
      <ChangedSection delta={d.delta} />
    </>
  );
}
