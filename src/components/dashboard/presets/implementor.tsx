import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { ImplDashboard, ImplPilotRow } from "@/server/dashboard-impl";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { CARD, ChangedSection, Empty, Panel } from "@/components/dashboard/presets/v2-sections";
import { RAG_TOKEN } from "@/lib/surface";

// Implementor preset (docs/17 §7, design handoff persona-dashboards): "what goes live
// next, and is it ready?" Since M8 the gates are REAL — a project's checkpoint template
// drives them, with milestones as a marked fallback for projects that have no template.
// The rollout WINDOW still comes from UAT/pilot-tagged milestones, which is about dates.
// DM1.73 (T7): the OpenGates panel folded into the hero (it re-rendered the hero's own
// gates) and Pilots + GoLiveCalendar merged into one dated Rollout calendar.

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
      {/* DM1.73 (T7): the OpenGates panel folded in here — it only re-rendered these
          same gates beside the hero. (T8): the source explainer that footed that panel
          lives in the title attribute now, not a visible strip. */}
      {g.openGates.length > 0 && (
        <ul
          className="mt-0.5 flex flex-col gap-1"
          title="Gates come from the project's checkpoint template · rollout window from UAT / pilot milestones"
        >
          {g.openGates.map((item, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: item.late ? "var(--bad)" : "var(--warn)", background: `color-mix(in oklab, var(${item.late ? "--bad" : "--warn"}) 10%, transparent)` }}>
                {item.late ? "✗ OPEN · LATE" : "✗ OPEN"}
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--ink2)]">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

/** DM1.73 (T7): Pilots + GoLiveCalendar merged — both were dated rollout milestones.
 * Calendar entries carry the dates; pilot/UAT projects LABEL their rows (stage badge +
 * gate segments). A pilot with no milestone in the 30-day window still appears, dated
 * by its go-live (or undated at the end), so nothing in flight vanishes. Combined
 * client-side from the payload the preset already had — no new queries. */
function RolloutCalendar({ d, now }: { d: ImplDashboard; now: Date }) {
  const pilotByProject = new Map(d.pilots.map((p) => [p.projectId, p]));
  type EventRow = { date: Date | null; label: string; projectId: string; projectCode: string; pilot?: ImplPilotRow };
  const events: EventRow[] = [...d.calendar]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({ ...e, pilot: pilotByProject.get(e.projectId) }));
  const covered = new Set(events.map((e) => e.projectId));
  for (const p of d.pilots) {
    if (!covered.has(p.projectId)) {
      events.push({ date: p.goLive, label: `${p.projectName} go-live`, projectId: p.projectId, projectCode: p.projectCode, pilot: p });
    }
  }
  events.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
  return (
    <Panel title="Rollout calendar" sub={`NEXT 30 DAYS · ${d.pilots.length} PILOT/UAT IN FLIGHT`}>
      {events.length === 0 && <Empty>No dated rollout milestones in the next 30 days.</Empty>}
      {events.map((e, i) => {
        const days = e.date ? Math.round((e.date.getTime() - now.getTime()) / 86_400_000) : null;
        return (
          // DM1.73 (T10): ?tab=Deadlines is retired (aliases to Overview) — say Overview.
          <Link key={i} href={`/projects/${e.projectId}?tab=Overview`} className="flex flex-wrap items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
            <CalendarDays className="size-3.5 flex-none text-[var(--brand)]" />
            <span className="w-[86px] flex-none font-mono text-[9.5px] font-bold tabular-nums text-[var(--qink)]">{e.date ? fmtDay(e.date) : "—"}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{e.label}</span>
            {e.pilot && (
              <>
                <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: e.pilot.stage === "UAT" ? "var(--qinfo)" : "var(--ok)", background: `color-mix(in oklab, var(${e.pilot.stage === "UAT" ? "--qinfo" : "--ok"}) 10%, transparent)` }}>
                  {e.pilot.stage.toUpperCase()}
                </span>
                <GateSegments done={e.pilot.gatesDone} total={e.pilot.gatesTotal} late={e.pilot.hasLateGate} />
                {e.pilot.gateSource === "milestones" && (
                  <span className="flex-none font-mono text-[8px] uppercase tracking-[.6px] text-[var(--ink5)]" title="No checkpoint template on this project — milestones shown instead">
                    ms
                  </span>
                )}
              </>
            )}
            <span className="hidden font-mono text-[9px] uppercase text-[var(--ink4)] md:block">{e.projectCode}</span>
            <span className="flex-none font-mono text-[9px] tabular-nums text-[var(--ink4)]">
              {days === null ? "—" : days === 0 ? "today" : days < 0 ? `${-days}d overdue` : `in ${days}d`}
            </span>
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
  showChecklist,
  now = new Date(),
}: {
  d: ImplDashboard;
  showChecklist: boolean;
  now?: Date;
}) {
  return (
    <>
      <FirstLoginChecklist group="implementor" show={showChecklist} />
      <GoLiveHero d={d} />
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Issues d={d} />
        <RolloutCalendar d={d} now={now} />
      </section>
      <HandoverDocs d={d} />
      {/* DM1.73 (T4): portfolio sections dropped — nothing portfolio-level on a member
          dashboard (docs/17 §4); the scope toggle went with them (nothing left to scope).
          (T3): the delta feed renders for every persona, not just the exec. */}
      <ChangedSection delta={d.delta} />
    </>
  );
}
