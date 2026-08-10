import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import type { PmDashboard, PmProjectRow } from "@/server/dashboard-pm";
import { statusBarTok } from "@/lib/project-view";
import type { PortfolioSectionsData } from "@/server/pipeline";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { CARD, ChangedSection, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// PM preset v2 (docs/32 M-W1c — the drawn shape, confirmed 2026-08-04): check-in
// banner → MY PROJECTS table (RAG · progress · Δ WoW · next milestone · blockers) →
// action queue + team load → the shared portfolio sections below the fold. The PM's
// landing question is "what needs me", not "browse the estate".

function Hero({ d, showChecklist }: { d: PmDashboard; showChecklist: boolean }) {
  const { checkins, agedBlockers, draftsPending } = d.hero;
  const unconfirmed = checkins.total - checkins.confirmed;
  // Wireframe: the banner carries the action, not just the fact. Check-ins are
  // confirmed in the workspace, so land on the worst project first (rows are sorted).
  const firstProject = d.myProjects[0];
  return (
    <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: "var(--cardbg)" }}>
      <FirstLoginChecklist group="pm" show={showChecklist} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-[13.5px] font-bold text-[var(--qink)]">
          {checkins.total === 0
            ? "No active projects under you yet."
            : unconfirmed === 0
              ? `All ${checkins.total} check-in${checkins.total === 1 ? "" : "s"} confirmed this week ✅`
              : `${unconfirmed} of ${checkins.total} check-in${checkins.total === 1 ? "" : "s"} unconfirmed — due Friday`}
        </span>
        {agedBlockers > 0 && (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[.8px] text-[var(--bad)]">
            <ShieldAlert className="size-3" /> {agedBlockers} blocker{agedBlockers === 1 ? "" : "s"} &gt;3d
          </span>
        )}
        {draftsPending > 0 && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[.8px] text-[var(--qinfo)]">
            {draftsPending} draft{draftsPending === 1 ? "" : "s"} awaiting approval
          </span>
        )}
        {unconfirmed > 0 && firstProject && (
          <Link
            href={`/projects/${firstProject.id}`}
            className="ml-auto rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)]"
          >
            Open check-ins →
          </Link>
        )}
      </div>
    </div>
  );
}


function MyProjects({ rows }: { rows: PmProjectRow[] }) {
  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Panel title="My projects" sub={`${rows.length} ACTIVE`}>
      {rows.length === 0 ? (
        <Empty>No active projects under you yet — take one on from the portfolio.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left">
                {["Project", "RAG", "Progress", "Next milestone", "Blockers", ""].map((h) => (
                  <th key={h} className="px-3 py-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--hair2)]">
                  <td className="px-3 py-2 font-semibold text-[var(--qink)]">{r.name}</td>
                  <td className="px-3 py-2"><span className="inline-block size-2 rounded-full" style={{ background: `var(${statusBarTok(r.status)})` }} /></td>
                  <td className="w-[150px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                        <div className="h-full rounded-full bg-[var(--ink3)]" style={{ width: `${r.progress}%` }} />
                      </div>
                      <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">
                        {r.progress}%
                        {r.deltaPct !== null && r.deltaPct !== 0 && (
                          <span style={{ color: r.deltaPct > 0 ? "var(--ok)" : "var(--bad)" }}>
                            {" "}{r.deltaPct > 0 ? "+" : ""}{r.deltaPct} WoW
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-[var(--ink3)]">
                    {r.nextMilestone ? (
                      <>
                        {r.nextMilestone.name} · {fmt(r.nextMilestone.dueDate)}
                        {r.nextMilestone.overdue && <span className="ml-1.5 font-mono text-[8.5px] font-bold uppercase text-[var(--bad)]">slipped</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.openBlockers > 0 ? (
                      <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--bad)]" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)" }}>
                        {r.openBlockers} open
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] text-[var(--ink5)]">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/projects/${r.id}`} className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-[var(--ink3)] hover:text-[var(--brand)]">
                      Open <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const QUEUE_KIND: Record<string, { label: string; tok: string }> = {
  join: { label: "JOIN", tok: "--qinfo" },
  drafts: { label: "APPROVAL", tok: "--qinfo" },
  blocker: { label: "BLOCKER", tok: "--bad" },
  slipping: { label: "SLIPPING", tok: "--warn" },
  report: { label: "REPORT", tok: "--ok" },
};

export function PmPreset({
  d,
  sections,
  showChecklist,
  scope,
}: {
  d: PmDashboard;
  sections: PortfolioSectionsData;
  showChecklist: boolean;
  scope: "mine" | "all";
}) {
  return (
    <>
      <Hero d={d} showChecklist={showChecklist} />

      <MyProjects rows={d.myProjects} />

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Action queue" sub={`${d.actionQueue.length} STUCK ON YOU`}>
          {d.actionQueue.length ? (
            d.actionQueue.map((row, i) => {
              const kind = QUEUE_KIND[row.kind];
              return (
                <Link key={i} href={row.href} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                  <span className="w-[72px] flex-none rounded-[5px] border px-1.5 py-0.5 text-center font-mono text-[8.5px] font-bold tracking-[.6px]" style={{ color: `var(${kind.tok})`, borderColor: `color-mix(in oklab, var(${kind.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${kind.tok}) 9%, transparent)` }}>
                    {kind.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{row.title}</span>
                  <span className="hidden max-w-[150px] truncate font-mono text-[9px] text-[var(--ink4)] md:block">{row.project}</span>
                  <span className="flex-none font-mono text-[9px] text-[var(--ink4)]">{row.meta}</span>
                  <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
                </Link>
              );
            })
          ) : (
            <Empty>Nothing is waiting on you. Enjoy it while it lasts.</Empty>
          )}
        </Panel>
        <Panel title="Team load" sub="MY PROJECT MEMBERS">
          {d.teamLoad.length ? (
            d.teamLoad.map((m) => {
              const over = m.totalPct > 100;
              const away = m.onLeaveUntil
                ? new Date(m.onLeaveUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                : null;
              return (
                <div key={m.userId} className="flex flex-col gap-1 p-[8px_16px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-[12px] font-medium text-[var(--ink2)]">{m.name}</span>
                      {/* docs/16 §5 — say they're away rather than showing a full bar. */}
                      {away && (
                        <span className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--qinfo)]" style={{ background: "color-mix(in oklab, var(--qinfo) 10%, transparent)" }}>
                          on leave until {away}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: over ? "var(--bad)" : "var(--ink3)" }}>
                      {m.totalPct}%{over ? " · OVER" : ""}
                      {m.effectivePct !== m.totalPct && (
                        <span className="text-[var(--ink4)]"> · {m.effectivePct}% eff</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.totalPct)}%`, background: over ? "var(--bad)" : "var(--brand)" }} />
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>No members allocated on your projects yet.</Empty>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-[var(--hair2)] p-[8px_16px]">
            <span className="font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)]">
              {d.teamLoad.filter((m) => m.totalPct > 90).length} over 90% · {d.teamLoad.filter((m) => m.onLeaveUntil).length} on leave
            </span>
            <Link href="/staffing" className="font-mono text-[9.5px] font-bold text-[var(--ink3)] hover:text-[var(--brand)]">
              Raise a resource request →
            </Link>
          </div>
        </Panel>
      </section>

      {/* The estate view stays reachable BELOW the four blocks (DM1.20: a filter with an
          ALL toggle, never a wall) — the landing question above is "what needs me". */}
      <ScopeToggle persona="pm" scope={scope} />
      <PortfolioSections data={sections} scope={scope} />
      {/* DM1.73 (T3): the delta feed renders for every persona, not just the exec —
          without it lastDashboardSeenAt never advanced for anyone else. */}
      <ChangedSection delta={d.delta} />
    </>
  );
}
