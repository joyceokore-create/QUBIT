import Link from "next/link";
import { ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";
import type { QaBugRaised, QaDashboard } from "@/server/dashboard-qa";
import type { PortfolioSectionsData } from "@/server/pipeline";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { CARD, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// QA preset (docs/17 §5, design handoff persona-dashboards): "what's ready for me to
// test, and which of my bugs are stuck?" Sentence hero + chips — deliberately NOT KPI
// tiles (18 §0 decision №1). Triage first, then the queue with the board-lens aging
// clock, then my bugs and per-project quality. Completion of Features/Bugs belongs to
// QA (docs/18 §4) — this queue is where that authority gets exercised.

function taskHref(t: { projectId: string; id: string }): string {
  return `/projects/${t.projectId}?tab=Board&task=${t.id}&lens=qa`;
}

function Hero({ d, userId }: { d: QaDashboard; userId: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: "var(--cardbg)" }}>
      <FirstLoginChecklist group="qa" userId={userId} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-[13.5px] font-bold text-[var(--qink)]">
          {d.hero.inQa === 0 ? "Nothing waiting on QA right now." : `${d.hero.inQa} item${d.hero.inQa === 1 ? "" : "s"} ready for you to test`}
        </span>
        {d.hero.criticalUnassigned > 0 && (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[.8px] text-[var(--bad)]">
            <TriangleAlert className="size-3" /> {d.hero.criticalUnassigned} critical bug{d.hero.criticalUnassigned === 1 ? "" : "s"} unassigned
          </span>
        )}
        {d.hero.agingOverThreshold > 0 && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[.8px] text-[var(--warn)]">
            {d.hero.agingOverThreshold} aging &gt;5d
          </span>
        )}
      </div>
    </div>
  );
}

const AGING_TOK: Record<string, string> = { bad: "--bad", warn: "--warn", ok: "--ink4" };

function TestQueue({ d }: { d: QaDashboard }) {
  const total = d.hero.inQa;
  return (
    <Panel title="Test queue" sub={`${total} IN QA · GROUPED BY PROJECT`}>
      {d.triage.length > 0 && (
        <div style={{ background: "color-mix(in oklab, var(--bad) 6%, transparent)" }}>
          <div className="p-[8px_16px] font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--bad)]">
            Triage first — {d.triage.length} critical bug{d.triage.length === 1 ? "" : "s"} unassigned
          </div>
          {d.triage.map((t) => (
            <Link key={t.id} href={taskHref(t)} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors hover:bg-[var(--wash)]">
              <span className="flex-none rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: "var(--bad)", borderColor: "color-mix(in oklab, var(--bad) 35%, transparent)", background: "color-mix(in oklab, var(--bad) 9%, transparent)" }}>
                CRIT
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{t.title}</span>
              <span className="hidden font-mono text-[9px] uppercase text-[var(--ink4)] md:block">{t.projectCode}</span>
              <span className="flex-none rounded-[5px] border border-[var(--w07)] px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--qink)]">Assign</span>
            </Link>
          ))}
        </div>
      )}
      {d.queue.length === 0 && d.triage.length === 0 && <Empty>Queue clear — nothing awaits verification.</Empty>}
      {d.queue.map((g) => (
        <div key={g.projectId}>
          <div className="flex items-baseline gap-2 border-b border-[var(--hair)] bg-[var(--wash)] p-[7px_16px]">
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-[var(--qink)]">{g.projectName}</span>
            <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">{g.items.length}</span>
          </div>
          {g.items.map((t) => (
            <Link
              key={t.id}
              href={taskHref(t)}
              className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]"
              style={t.aging === "bad" ? { background: "color-mix(in oklab, var(--warn) 5%, transparent)" } : undefined}
            >
              {/* Business-day age, board-lens clock — the tint IS the honesty signal. */}
              <span className="w-[40px] flex-none rounded-[5px] px-1.5 py-0.5 text-center font-mono text-[9px] font-bold tabular-nums" style={{ color: `var(${AGING_TOK[t.aging]})`, background: `color-mix(in oklab, var(${AGING_TOK[t.aging]}) 10%, transparent)` }}>
                {t.ageBusinessDays}d
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{t.title}</span>
              <span className="flex-none rounded-[5px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--ink4)]">
                {t.kind === "bug" ? "BUG" : "TEST"}
              </span>
              <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
            </Link>
          ))}
        </div>
      ))}
      <div className="p-[8px_16px] font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
        Tinted rows sat &gt;5 business days · features &amp; bugs complete here — QA owns Completed
      </div>
    </Panel>
  );
}

const SEVERITY_TOK: Record<string, string> = { Critical: "--bad", High: "--warn", Medium: "--qinfo", Low: "--ink4" };
const SEVERITY_SHORT: Record<string, string> = { Critical: "CRIT", High: "HIGH", Medium: "MED", Low: "LOW" };
const BUG_STATUS: Record<string, { label: string; tok: string }> = {
  InQA: { label: "WITH QA", tok: "--qinfo" },
  InReview: { label: "IN REVIEW", tok: "--qinfo" },
  InProgress: { label: "IN PROGRESS", tok: "--qinfo" },
  NotStarted: { label: "TO DO", tok: "--ink4" },
  Completed: { label: "DONE", tok: "--ok" },
};

function BugRow({ b }: { b: QaBugRaised }) {
  const status = BUG_STATUS[b.status] ?? { label: b.status.toUpperCase(), tok: "--ink4" };
  const sevShort = SEVERITY_SHORT[b.severity] ?? b.severity.toUpperCase();
  return (
    <Link href={taskHref(b)} className="flex items-center gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
      <span className="flex-none rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: `var(${SEVERITY_TOK[b.severity] ?? "--ink4"})`, borderColor: `color-mix(in oklab, var(${SEVERITY_TOK[b.severity] ?? "--ink4"}) 35%, transparent)` }}>
        {sevShort}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-[var(--ink2)]">{b.title}</span>
        <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
          {b.projectCode} · raised {b.raisedDaysAgo}d ago
        </span>
      </span>
      {b.reopened && (
        <span className="flex flex-none items-center gap-0.5 rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-[var(--bad)]" style={{ background: "var(--badbg)" }}>
          <RotateCcw className="size-2.5" /> REOPENED
        </span>
      )}
      <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: `var(${status.tok})`, background: `color-mix(in oklab, var(${status.tok}) 10%, transparent)` }}>
        {status.label}
      </span>
    </Link>
  );
}

function Quality({ d }: { d: QaDashboard }) {
  return (
    <Panel title="Project quality" sub="OPEN BUGS · MY PROJECTS">
      {d.quality.length === 0 && <Empty>No bugs on your projects. Suspicious… or excellent.</Empty>}
      {d.quality.map((q) => {
        const { critical, high, medium, low } = q.bySeverity;
        const open = critical + high + medium + low;
        const seg = (n: number) => (open ? `${(n / open) * 100}%` : "0%");
        return (
          <div key={q.projectId} className="flex flex-col gap-1.5 border-b border-[var(--hair2)] p-[9px_16px] last:border-0">
            <div className="flex items-baseline gap-2">
              <Link href={`/projects/${q.projectId}?tab=Board&lens=qa`} className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--qink)] hover:text-[var(--brand)]">
                {q.projectName}
              </Link>
              <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">
                {critical}C · {high}H · {medium + low}M/L
              </span>
              {q.reopenRatePct !== null && (
                <span className="font-mono text-[9px] font-bold tabular-nums" style={{ color: q.reopenRatePct > 10 ? "var(--warn)" : "var(--ink4)" }}>
                  {q.reopenRatePct}% REOPEN
                </span>
              )}
            </div>
            {open > 0 && (
              <div className="flex h-[5px] overflow-hidden rounded-full bg-[var(--wash2)]">
                <span style={{ width: seg(critical), background: "var(--bad)" }} />
                <span style={{ width: seg(high), background: "var(--warn)" }} />
                <span style={{ width: seg(medium + low), background: "var(--qinfo)" }} />
              </div>
            )}
          </div>
        );
      })}
      <div className="p-[8px_16px] font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
        Requirement coverage joins after M8 · <Link href="/risks" className="underline underline-offset-2 hover:text-[var(--qink)]">open risks →</Link>
      </div>
    </Panel>
  );
}

export function QaPreset({
  d,
  sections,
  userId,
  scope,
}: {
  d: QaDashboard;
  sections: PortfolioSectionsData;
  userId: string;
  scope: "mine" | "all";
}) {
  return (
    <>
      <Hero d={d} userId={userId} />
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TestQueue d={d} />
        <div className="flex flex-col gap-3.5">
          <Panel title="Bugs I raised" sub={`${d.bugsRaised.filter((b) => b.status !== "Completed").length} OPEN · REPORTER: ME`}>
            {d.bugsRaised.length ? d.bugsRaised.map((b) => <BugRow key={b.id} b={b} />) : <Empty>You haven&apos;t raised any bugs yet.</Empty>}
          </Panel>
          <Quality d={d} />
        </div>
      </section>
      {/* DM1.20 extension (design proposal №10, adopted): scoped by default, never a wall. */}
      <ScopeToggle persona="qa" scope={scope} />
      <PortfolioSections data={sections} scope={scope} />
    </>
  );
}
