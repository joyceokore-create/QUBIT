import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, ShieldAlert } from "lucide-react";
import type { PmDashboard, PmProjectCard } from "@/server/dashboard-pm";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { CARD, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// PM preset (docs/17 §3): "Are my projects on track this week, and what's stuck on me?"
// Default scope = projects I lead/manage, with an ALL toggle — a filter, never a
// visibility wall (DM1.20). No portfolio heatmap here: the PM's unit of thought is
// the project.

const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

function RagDelta({ delta }: { delta: -1 | 0 | 1 | null }) {
  if (delta === null) return null;
  if (delta > 0) return <ArrowUpRight className="size-3 text-[var(--bad)]" aria-label="worsened vs last week" />;
  if (delta < 0) return <ArrowDownRight className="size-3 text-[var(--ok)]" aria-label="improved vs last week" />;
  return <Minus className="size-3 text-[var(--ink5)] opacity-60" aria-label="unchanged vs last week" />;
}

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

function ProjectCards({ cards, scope, avg }: { cards: PmProjectCard[]; scope: "mine" | "all"; avg: number }) {
  const visible = scope === "mine" ? cards.filter((c) => c.isMine) : cards;
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Projects</h2>
        <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">AVG PROGRESS {avg}%</span>
        {/* Scope toggle (DM1.20): default mine, never a wall. */}
        <span className="ml-auto flex items-center gap-1 rounded-full border border-[var(--w07)] bg-[var(--wash)] p-0.5">
          {(["mine", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`/dashboard?persona=pm&scope=${s}`}
              className={`rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors ${
                scope === s ? "bg-[var(--brand)] text-[var(--onbrand)]" : "text-[var(--ink4)] hover:text-[var(--qink)]"
              }`}
            >
              {s === "mine" ? "My projects" : "All"}
            </Link>
          ))}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className={`${CARD} p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
          {scope === "mine" ? "You don't lead or manage any active projects — flip to All, or take one on." : "No active projects."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <Link key={c.id} href={`/projects/${c.id}`} className={`${CARD} flex flex-col gap-2 p-3.5 transition-colors hover:border-[var(--brand)]`} style={{ background: "var(--cardbg)" }}>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-[6px] border px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ color: `var(${RAG_TOKEN[c.rag]})`, borderColor: `color-mix(in oklab, var(${RAG_TOKEN[c.rag]}) 35%, transparent)`, background: `color-mix(in oklab, var(${RAG_TOKEN[c.rag]}) 9%, transparent)` }}>
                  <span className="size-1.5 rounded-full" style={{ background: `var(${RAG_TOKEN[c.rag]})` }} />
                  {c.rag.toUpperCase()}
                </span>
                <RagDelta delta={c.ragDelta} />
                {c.unconfirmed && (
                  <span className="rounded-[5px] bg-[var(--warn)]/12 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.6px] text-[var(--warn)]" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
                    Unconfirmed
                  </span>
                )}
                <span className="ml-auto font-mono text-[9px] text-[var(--ink4)]">{c.code}</span>
              </div>
              <p className="truncate text-[13px] font-semibold text-[var(--qink)]">{c.name}</p>
              <div className="flex items-center gap-2">
                <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                  <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${c.progress}%` }} />
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink3)]">{c.progress}%</span>
                <span className="rounded-[4px] bg-[var(--wash2)] px-1 py-0.5 font-mono text-[8.5px] tabular-nums" style={{ color: c.vsAvg >= 0 ? "var(--ok)" : "var(--warn)" }} title="vs portfolio average">
                  {c.vsAvg >= 0 ? "+" : ""}
                  {c.vsAvg}% vs avg
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.6px] text-[var(--ink4)]">
                {c.nextMilestone ? (
                  <span className="min-w-0 truncate">
                    Next: {c.nextMilestone.name} · {c.nextMilestone.due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                ) : (
                  <span>No upcoming milestone</span>
                )}
                {c.openBlockers > 0 && <span className="ml-auto flex-none text-[var(--bad)]">{c.openBlockers} blocked</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

const QUEUE_KIND: Record<string, { label: string; tok: string }> = {
  join: { label: "JOIN", tok: "--qinfo" },
  drafts: { label: "APPROVAL", tok: "--qinfo" },
  blocker: { label: "BLOCKER", tok: "--bad" },
  slipping: { label: "SLIPPING", tok: "--warn" },
};

export function PmPreset({ d, userId, scope }: { d: PmDashboard; userId: string; scope: "mine" | "all" }) {
  return (
    <>
      <Hero d={d} userId={userId} />
      <ProjectCards cards={d.cards} scope={scope} avg={d.portfolioAvgProgress} />
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
