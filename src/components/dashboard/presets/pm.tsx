import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import type { PmDashboard } from "@/server/dashboard-pm";
import type { PortfolioSectionsData } from "@/server/pipeline";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { CARD, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// PM preset (docs/17 §3, project listing per amended docs/18 §6): the check-in ritual
// first, then the SAME portfolio-grouped sections every persona sees — scoped to my
// projects by default, with an ALL toggle that is a filter, never a wall (DM1.20) —
// then what's stuck on me.

function Hero({ d, userId }: { d: PmDashboard; userId: string }) {
  const { checkins, agedBlockers, draftsPending } = d.hero;
  const unconfirmed = checkins.total - checkins.confirmed;
  return (
    <div className={`${CARD} flex flex-col gap-2 p-4`} style={{ background: "var(--cardbg)" }}>
      <FirstLoginChecklist group="pm" userId={userId} />
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
      </div>
    </div>
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
  userId,
  scope,
}: {
  d: PmDashboard;
  sections: PortfolioSectionsData;
  userId: string;
  scope: "mine" | "all";
}) {
  return (
    <>
      <Hero d={d} userId={userId} />

      {/* Scope toggle (DM1.20): default mine, never a wall. */}
      <ScopeToggle persona="pm" scope={scope} />
      <PortfolioSections data={sections} scope={scope} />

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
              return (
                <div key={m.userId} className="flex flex-col gap-1 p-[8px_16px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--ink2)]">{m.name}</span>
                    <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: over ? "var(--bad)" : "var(--ink3)" }}>
                      {m.totalPct}%{over ? " · OVER" : ""}
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
        </Panel>
      </section>
    </>
  );
}
