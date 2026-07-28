import Link from "next/link";
import { ArrowRight, TrendingUp, CalendarClock, UsersRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDashboardV2, type DashboardV2 } from "@/server/dashboard-v2";
import { Forbidden } from "@/components/forbidden";
import { LiveClock } from "@/components/command/live-clock";
import { HealthRing } from "@/components/command/health-ring";
import { Sparkline } from "@/components/dashboard/sparkline";
import { PortfolioHeatmap } from "@/components/dashboard/portfolio-heatmap";

// ── Dashboard v2 (M1, docs/16-revamp-plan.md §3). Three questions in ten seconds:
// what needs me, what changed, what's at risk. Full tables live on their own pages
// (/projects, /risks, /people); density belongs in drill-downs, never here. One shared
// dashboard for every role (DM1.10) — role composition only reorders the sections.

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const SEV: Record<string, string> = { red: "--bad", amber: "--warn", info: "--qinfo", bad: "--bad", warn: "--warn", ok: "--ok" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const d = await getDashboardV2(ctx);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  // Role composition (DM1.10): executives get Health first with Today collapsed;
  // everyone else opens on Today. Same sections, same data — ordering only.
  const execView = ctx.roles.includes("Executive");

  const todaySection = <TodaySection d={d} collapsed={execView} />;
  const changedSection = <ChangedSection d={d} />;
  const atRiskSection = <AtRiskSection d={d} />;

  return (
    <div>
      {/* Header strip */}
      <div className="mx-auto flex w-full max-w-[1360px] items-baseline gap-3.5 px-6 pt-[18px] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <span className="font-mono rv:font-sans text-[10.5px] rv:text-overline font-semibold tracking-[2.4px] text-[var(--ink4)]">GROUP OVERVIEW · {session.user.tenantName?.toUpperCase()}</span>
        <span className="-translate-y-[3px] flex-1 border-b border-[var(--hair2)]" />
        <span className="font-mono text-[10.5px] tracking-[1px] text-[var(--ink4)]">{today}</span>
        <LiveClock />
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[1.5px] text-[var(--ok)]">
          <span className="size-1.5 rounded-full bg-[var(--ok)] [animation:pulseGlow_2.6s_infinite]" /> LIVE
        </span>
      </div>

      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[14px_24px_90px]">
        {execView ? (
          <>
            {atRiskSection}
            {changedSection}
            {todaySection}
          </>
        ) : (
          <>
            {todaySection}
            {changedSection}
            {atRiskSection}
          </>
        )}
      </main>
    </div>
  );
}

// ── Q1: What needs me today? ──────────────────────────────────────────────────
function TodaySection({ d, collapsed }: { d: DashboardV2; collapsed: boolean }) {
  const body = (
    <Panel title="Needs attention" sub="TOP 5 · FOR YOU">
      {d.priorities.length ? (
        d.priorities.map((p) => (
          <Link key={`${p.kind}:${p.id}`} href={p.href} className="flex items-start gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
            <span className="mt-[5px] h-[22px] w-[3px] flex-none rounded-[2px]" style={{ background: `var(${SEV[p.severity]})` }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-[var(--ink2)]">{p.title}</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink4)]">{p.meta}</span>
            </span>
            <ArrowRight className="mt-1.5 size-3 flex-none text-[var(--ink5)]" />
          </Link>
        ))
      ) : (
        <Empty>All clear — nothing needs you right now.</Empty>
      )}
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

// ── Q2: What changed since I last looked? ────────────────────────────────────
function ChangedSection({ d }: { d: DashboardV2 }) {
  const since = d.delta.since.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Panel title="Since you last looked" sub={`FROM ${since.toUpperCase()}`}>
      {d.delta.items.length ? (
        d.delta.items.map((it, i) => {
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

// ── Q3: What's at risk? ──────────────────────────────────────────────────────
function AtRiskSection({ d }: { d: DashboardV2 }) {
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

// ── Shared bits ──────────────────────────────────────────────────────────────
function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}
