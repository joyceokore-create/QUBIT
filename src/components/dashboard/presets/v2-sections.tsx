import Link from "next/link";
import { ArrowRight, TrendingUp, CalendarClock, UsersRound } from "lucide-react";
import type { DashboardV2 } from "@/server/dashboard-v2";
import { HealthRing } from "@/components/command/health-ring";
import { Sparkline } from "@/components/dashboard/sparkline";
import { PortfolioHeatmap } from "@/components/dashboard/portfolio-heatmap";
import { NeedsAttentionList } from "@/components/dashboard/needs-attention";

// The M1 "three questions" sections (docs/16 §3) — now the INTERIM preset for personas
// whose dedicated composition hasn't shipped yet (docs/17 §8: developer/PM land M1b,
// QA/implementor M1c). The executive preset lives in ./executive.tsx.

export const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
export const SEV: Record<string, string> = { red: "--bad", amber: "--warn", info: "--qinfo", bad: "--bad", warn: "--warn", ok: "--ok" };

export function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className={CARD} style={{ background: "var(--cardbg)", animation: "rise .5s cubic-bezier(.22,1,.36,1) both" }}>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
        <span className="font-heading text-[13.5px] rv:text-heading-xs font-bold text-[var(--qink)]">{title}</span>
        {sub && <span className="font-mono rv:font-sans text-[9px] rv:text-overline tracking-[1.2px] text-[var(--ink4)]">{sub}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}

export function TodaySection({ d, collapsed }: { d: DashboardV2; collapsed: boolean }) {
  const body = (
    <Panel title="Needs attention" sub="TOP 5 · FOR YOU">
      <NeedsAttentionList items={d.priorities} nudges={d.nudges.map((n) => ({ id: n.id, entityId: n.entityId }))} />
    </Panel>
  );

  if (!collapsed) return body;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-[12px] border border-[var(--cardbd)] p-[10px_16px] font-heading text-[13px] font-bold text-[var(--ink3)] transition-colors hover:text-[var(--qink)] group-open:hidden" style={{ background: "var(--cardbg)" }}>
        Today · {d.priorities.length} item{d.priorities.length === 1 ? "" : "s"} need you — expand
      </summary>
      {body}
    </details>
  );
}

export function ChangedSection({ delta }: { delta: DashboardV2["delta"] }) {
  const since = delta.since.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Panel title="Since you last looked" sub={`FROM ${since.toUpperCase()}`}>
      {delta.items.length ? (
        delta.items.map((it, i) => {
          const inner = (
            <>
              <span className="w-[3px] flex-none self-stretch rounded-[2px]" style={{ background: `var(${SEV[it.tone]})` }} />
              <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-[var(--ink2)]">{it.text}</span>
              {it.href && <ArrowRight className="mt-0.5 size-3 flex-none text-[var(--ink5)]" />}
            </>
          );
          const cls = "flex items-start gap-[11px] border-b border-[var(--hair2)] p-[9px_16px] last:border-0";
          return it.href ? (
            <Link key={i} href={it.href} className={`${cls} transition-colors hover:bg-[var(--wash)]`}>{inner}</Link>
          ) : (
            <div key={i} className={cls}>{inner}</div>
          );
        })
      ) : (
        <Empty>Nothing new since your last visit.</Empty>
      )}
    </Panel>
  );
}

export function AtRiskSection({ d }: { d: DashboardV2 }) {
  const { kpis, health } = d;
  const kpiTiles = [
    {
      label: "On-track %",
      value: `${kpis.onTrackPct.current}%`,
      tok: kpis.onTrackPct.current >= 70 ? "--ok" : "--warn",
      foot: `${health.onTrack} of ${health.total} projects`,
      href: "/projects",
      points: kpis.onTrackPct.points,
      Icon: TrendingUp,
    },
    {
      label: "Overdue tasks",
      value: kpis.overdueTasks.current,
      tok: kpis.overdueTasks.current ? "--bad" : "--ok",
      foot: "past due · open",
      href: "/projects",
      points: kpis.overdueTasks.points,
      Icon: CalendarClock,
    },
    {
      label: "Capacity pressure",
      value: kpis.capacity.current,
      tok: kpis.capacity.current ? "--bad" : "--ok",
      foot: `over-allocated of ${kpis.capacity.allocated} allocated`,
      href: "/people",
      points: kpis.capacity.points,
      Icon: UsersRound,
    },
  ];

  return (
    <section className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        {kpiTiles.map((k) => {
          const Icon = k.Icon;
          return (
            <Link key={k.label} href={k.href} className="flex flex-col gap-2 rounded-xl p-4 shadow-[var(--cardsh)]" style={{ background: "var(--cardbg)" }}>
              <div className="flex items-center gap-2">
                <span className="flex size-7 flex-none items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, var(${k.tok}) 14%, transparent)`, color: `var(${k.tok})` }}>
                  <Icon className="size-[15px]" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="font-mono rv:font-sans text-[9px] rv:text-overline font-medium uppercase tracking-[1.4px] text-[var(--ink4)]">{k.label}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="font-heading rv:font-data text-[26px] rv:text-data-lg font-bold leading-none tracking-[-.6px] tabular-nums" style={{ color: `var(${k.tok})` }}>{k.value}</span>
                <Sparkline points={k.points} tone={k.tok} />
              </div>
              <div className="text-[10px] text-[var(--ink4)]">{k.foot}</div>
            </Link>
          );
        })}
        <div className={`${CARD} flex flex-col items-center justify-center gap-1.5 p-[12px_18px]`} style={{ background: "var(--cardbg)" }}>
          <HealthRing score={health.pct} />
          <div className="flex gap-2.5 font-mono text-[9px] tracking-[.5px]">
            <span className="text-[var(--ok)]">{health.onTrack} ON</span>
            <span className="text-[var(--warn)]">{health.needAttention} RISK</span>
            <span className="text-[var(--qinfo)]">{health.planning} PLAN</span>
          </div>
        </div>
      </div>

      {d.heatmap ? (
        <Panel title="Portfolio × subsidiary" sub="DRILL DOWN">
          <PortfolioHeatmap data={d.heatmap} />
        </Panel>
      ) : d.portfolioList?.length ? (
        <Panel title="Portfolios" sub="DRILL DOWN">
          {d.portfolioList.map((p) => (
            <Link key={p.id} href={`/portfolios/${p.id}`} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--qink)]">{p.name}</span>
              <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">{p.itemCount} projects</span>
              <span className="flex gap-2 font-mono text-[9px] tracking-[.5px]">
                <span className="text-[var(--ok)]">{p.onTrack} OK</span>
                <span className="text-[var(--warn)]">{p.atRisk} AR</span>
                <span className="text-[var(--bad)]">{p.overdue} OD</span>
              </span>
              <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
            </Link>
          ))}
        </Panel>
      ) : null}
    </section>
  );
}
