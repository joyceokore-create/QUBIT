import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { ImplDashboard } from "@/server/dashboard-impl";
import type { PortfolioSectionsData } from "@/server/pipeline";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { CARD, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// Implementor preset (docs/17 §7, design handoff persona-dashboards): "what goes live
// next, and is it ready?" Since M8 the gates are REAL — a project's checkpoint template
// drives them, with milestones as a marked fallback for projects that have no template.
// The rollout WINDOW still comes from UAT/pilot-tagged milestones, which is about dates.

const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };
const SEVERITY_TOK: Record<string, string> = { Critical: "--bad", High: "--warn", Medium: "--qinfo", Low: "--ink4" };
const SEVERITY_SHORT: Record<string, string> = { Critical: "CRIT", High: "HIGH", Medium: "MED", Low: "LOW" };

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function GoLiveHero({ d }: { d: ImplDashboard }) {
  const g = d.nextGoLive;
  if (!g) {
    return (
      <div className={`${CARD} p-5`} style={{ background: "var(--cardbg)" }}>
        <p className="font-heading text-[17px] font-bold text-[var(--qink)]">No go-live on the horizon</p>
        <p className="mt-1 text-[12.5px] text-[var(--ink3)]">
          Nothing in your projects carries a dated UAT/pilot milestone yet — tag one on a{" "}
          <Link href="/projects" className="text-[var(--brand)] underline underline-offset-2">project&apos;s deadlines</Link> and it lands here.
        </p>
      </div>
    );
  }
  const overdue = g.daysUntil < 0;
  return (
    <div className={`${CARD} flex flex-col gap-2 p-5`} style={{ background: "var(--cardbg)" }}>
      <span className="font-mono text-[9px] font-bold uppercase tracking-[1.4px] text-[var(--brand)]">Next go-live</span>
      <Link href={`/projects/${g.projectId}`} className="font-heading text-[22px] font-bold leading-[1.2] tracking-[-.4px] text-[var(--qink)] hover:text-[var(--brand)]">
        {g.projectName} — {g.milestoneName}
      </Link>
      <p className="font-mono text-[10px] uppercase tracking-[1px] text-[var(--ink4)]">
        {fmtDay(g.dueDate)} ·{" "}
        <span style={{ color: overdue ? "var(--bad)" : undefined }}>
          {overdue ? `${-g.daysUntil} day${g.daysUntil === -1 ? "" : "s"} overdue` : `in ${g.daysUntil} day${g.daysUntil === 1 ? "" : "s"}`}
        </span>{" "}
        · <span style={{ color: `var(${RAG_TOKEN[g.rag]})` }}>{g.rag}</span>
      </p>
      <p className="text-[12.5px] leading-relaxed text-[var(--ink3)]">
        {g.gatesTotal - g.gatesDone} of {g.gatesTotal} gate item{g.gatesTotal === 1 ? "" : "s"} still open
        {g.openGates[0] ? ` — ${g.openGates[0].name} ${g.openGates[0].late ? "is already late and leads the critical path." : "is next on the critical path."}` : "."}
      </p>
    </div>
  );
}

function OpenGates({ d }: { d: ImplDashboard }) {
  const g = d.nextGoLive;
  return (
    <Panel title="Open gate items" sub={g ? `${g.gatesTotal - g.gatesDone} OF ${g.gatesTotal}` : "—"}>
      {g?.openGates.length ? (
        g.openGates.map((item, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] last:border-0">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{item.name}</span>
            <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: item.late ? "var(--bad)" : "var(--warn)", background: `color-mix(in oklab, var(${item.late ? "--bad" : "--warn"}) 10%, transparent)` }}>
              {item.late ? "✗ OPEN · LATE" : "✗ OPEN"}
            </span>
          </div>
        ))
      ) : (
        <Empty>All gates closed — ship it.</Empty>
      )}
      {/* M8 shipped: gates are the project's real checkpoints. Projects without a
          template still fall back to milestones, and the row says so. */}
      <div className="p-[8px_16px] font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
        Gates come from the project&apos;s checkpoint template · rollout window from UAT / pilot milestones
      </div>
    </Panel>
  );
}

function GateSegments({ done, total, late }: { done: number; total: number; late: boolean }) {
  const cells = Math.min(total, 8);
  const doneCells = total ? Math.round((done / total) * cells) : 0;
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-[2px]">
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className="size-[9px] rounded-[2px]" style={{ background: i < doneCells ? "var(--ok)" : late && i === doneCells ? "var(--bad)" : "var(--wash2)" }} />
        ))}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">{done}/{total}</span>
    </span>
  );
}

function Pilots({ d }: { d: ImplDashboard }) {
  return (
    <Panel title="Pilot & UAT projects" sub={`${d.pilots.length} IN FLIGHT`}>
      {d.pilots.length === 0 && <Empty>No projects in the rollout window.</Empty>}
      {d.pilots.map((p) => (
        <Link key={p.projectId} href={`/projects/${p.projectId}?tab=Deadlines`} className="flex flex-wrap items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-[var(--qink)]">{p.projectName}</span>
            <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">{p.projectCode}</span>
          </span>
          <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: p.stage === "UAT" ? "var(--qinfo)" : "var(--ok)", background: `color-mix(in oklab, var(${p.stage === "UAT" ? "--qinfo" : "--ok"}) 10%, transparent)` }}>
            {p.stage.toUpperCase()}
          </span>
          <GateSegments done={p.gatesDone} total={p.gatesTotal} late={p.hasLateGate} />
          {p.gateSource === "milestones" && (
            <span className="flex-none font-mono text-[8px] uppercase tracking-[.6px] text-[var(--ink5)]" title="No checkpoint template on this project — milestones shown instead">
              ms
            </span>
          )}
          <span className="w-[64px] flex-none text-right font-mono text-[9px] tabular-nums text-[var(--ink3)]">
            {p.goLive ? p.goLive.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
          </span>
          <span className="flex flex-none items-center gap-1 font-mono text-[9px] font-bold" style={{ color: `var(${RAG_TOKEN[p.rag]})` }}>
            <span className="size-1.5 rounded-full" style={{ background: `var(${RAG_TOKEN[p.rag]})` }} /> {p.rag}
          </span>
        </Link>
      ))}
    </Panel>
  );
}

function Issues({ d }: { d: ImplDashboard }) {
  return (
    <Panel title="Rollout issues" sub={`${d.issues.length} OPEN`}>
      {d.issues.length === 0 && <Empty>No open blockers on rollout projects.</Empty>}
      {d.issues.map((issue) => (
        <div key={issue.id} className="flex items-start gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] last:border-0">
          <span className="mt-0.5 flex-none rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: `var(${SEVERITY_TOK[issue.severity] ?? "--ink4"})`, borderColor: `color-mix(in oklab, var(${SEVERITY_TOK[issue.severity] ?? "--ink4"}) 35%, transparent)` }}>
            {SEVERITY_SHORT[issue.severity] ?? issue.severity.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{issue.description}</span>
            <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
              {issue.projectCode}
              {issue.ownerName ? ` · owner: ${issue.ownerName}` : " · unowned"}
            </span>
          </span>
          <span className="flex-none font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">{issue.ageDays}d</span>
        </div>
      ))}
    </Panel>
  );
}

function GoLiveCalendar({ d, now }: { d: ImplDashboard; now: Date }) {
  const events = [...d.calendar].sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <Panel title="Go-live calendar" sub="NEXT 30 DAYS">
      {events.length === 0 && <Empty>No dated rollout milestones in the next 30 days.</Empty>}
      {events.map((e, i) => {
        const days = Math.round((e.date.getTime() - now.getTime()) / 86_400_000);
        return (
          <Link key={i} href={`/projects/${e.projectId}?tab=Deadlines`} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
            <CalendarDays className="size-3.5 flex-none text-[var(--brand)]" />
            <span className="w-[86px] flex-none font-mono text-[9.5px] font-bold tabular-nums text-[var(--qink)]">{fmtDay(e.date)}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{e.label}</span>
            <span className="hidden font-mono text-[9px] uppercase text-[var(--ink4)] md:block">{e.projectCode}</span>
            <span className="flex-none font-mono text-[9px] tabular-nums text-[var(--ink4)]">{days === 0 ? "today" : `in ${days}d`}</span>
          </Link>
        );
      })}
    </Panel>
  );
}

function HandoverDocs({ d }: { d: ImplDashboard }) {
  return (
    <Panel title="Handover docs" sub={`${d.handoverDocs.length} PENDING REVIEW`}>
      {d.handoverDocs.length === 0 && <Empty>Nothing awaiting review.</Empty>}
      {d.handoverDocs.map((doc) => (
        <Link key={doc.id} href={`/projects/${doc.projectId}?tab=Documents`} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{doc.title}</span>
          <span className="hidden font-mono text-[9px] uppercase text-[var(--ink4)] md:block">{doc.projectCode}</span>
          <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px] text-[var(--warn)]" style={{ background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
            AWAITING REVIEW
          </span>
          <span className="flex-none font-mono text-[9px] tabular-nums text-[var(--ink4)]">{doc.ageDays}d</span>
          <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
        </Link>
      ))}
    </Panel>
  );
}

export function ImplementorPreset({
  d,
  sections,
  showChecklist,
  scope,
  now = new Date(),
}: {
  d: ImplDashboard;
  sections: PortfolioSectionsData;
  showChecklist: boolean;
  scope: "mine" | "all";
  now?: Date;
}) {
  return (
    <>
      <FirstLoginChecklist group="implementor" show={showChecklist} />
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <GoLiveHero d={d} />
        <OpenGates d={d} />
      </section>
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Pilots d={d} />
        <Issues d={d} />
      </section>
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <GoLiveCalendar d={d} now={now} />
        <HandoverDocs d={d} />
      </section>
      {/* DM1.20 extension (design proposal №10, adopted): scoped by default, never a wall. */}
      <ScopeToggle persona="implementor" scope={scope} />
      <PortfolioSections data={sections} scope={scope} />
    </>
  );
}
