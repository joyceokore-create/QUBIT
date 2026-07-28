import Link from "next/link";
import { ArrowRight, FolderKanban, Wallet, TriangleAlert, Flag, Gauge, Activity, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getExecDashboard } from "@/server/exec-dashboard";
import { Forbidden } from "@/components/forbidden";
import { LiveClock } from "@/components/command/live-clock";
import { HealthRing } from "@/components/command/health-ring";
import { statusMeta } from "@/lib/project-view";

// ── Exec dashboard. Everything shown is grounded in live tenant data — no placeholder
// columns, no "coming soon" panels, and nothing labelled AI that isn't (M0 cull,
// docs/16-revamp-plan.md §2). The ten-second Today/Changed/At-risk redesign lands in M1.

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const SEV: Record<string, string> = { red: "--bad", amber: "--warn", info: "--qinfo", bad: "--bad", warn: "--warn", ok: "--ok" };

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase() : "—";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const d = await getExecDashboard(ctx);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  const { health, kpis } = d;

  const kpiCards = [
    { label: "Projects", value: kpis.projects, tok: "--qink", iconTok: "--brand", foot: `${kpis.onTrack} on track`, href: "/projects", Icon: FolderKanban, meter: kpis.projects ? kpis.onTrack / kpis.projects : null },
    { label: "Budget", value: kpis.budget, tok: "--qink", iconTok: "--ok", foot: "portfolio total", href: "/projects", Icon: Wallet, meter: null },
    { label: "Risks", value: kpis.risksOpen, tok: kpis.risksOpen ? "--warn" : "--ok", iconTok: "--warn", foot: "open", href: "/risks", Icon: TriangleAlert, meter: null },
    { label: "Milestones", value: kpis.milestonesUpcoming, tok: "--qink", iconTok: "--qinfo", foot: `${kpis.milestonesOverdue} overdue`, href: "/projects", Icon: Flag, meter: null },
    { label: "Velocity", value: kpis.velocity7d, tok: "--qink", iconTok: "--accent-indigo", foot: "done · 7d", href: "/projects", Icon: Gauge, meter: null },
    { label: "Health", value: `${kpis.healthPct}%`, tok: kpis.healthPct >= 70 ? "--ok" : "--warn", iconTok: "--ok", foot: `${kpis.needAttention} need attention`, href: "/projects", Icon: Activity, meter: kpis.healthPct / 100 },
    { label: "Resources", value: kpis.peopleAllocated, tok: kpis.overAllocated ? "--bad" : "--qink", iconTok: "--qinfo", foot: `${kpis.overAllocated} over-allocated`, href: "/people", Icon: Users, meter: null },
  ];

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
        {/* ── Row 1: Priorities · Health · Notifications ── */}
        <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)]">
          <Panel title="Today's priorities" sub="FOR YOU">
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

          <Panel title="Portfolio health" sub="RAG">
            <div className="flex flex-col items-center gap-2.5 p-4">
              <HealthRing score={health.pct} />
              <div className="flex gap-3 font-mono text-[9.5px] tracking-[.6px]">
                <span className="text-[var(--ok)]">{health.onTrack} ON</span>
                <span className="text-[var(--warn)]">{health.needAttention} RISK</span>
                <span className="text-[var(--qinfo)]">{health.planning} PLAN</span>
              </div>
            </div>
          </Panel>

          <Panel title="Notifications" sub="RECENT">
            {d.notifications.length ? (
              d.notifications.map((n) => (
                <Link key={n.id} href={n.link ?? "/my-tasks"} className="block border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                  <span className="block truncate text-[12px] text-[var(--ink2)]">{n.message}</span>
                  <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[1px] text-[var(--ink4)]">{fmtDate(n.createdAt)}{n.read ? "" : " · new"}</span>
                </Link>
              ))
            ) : (
              <Empty>Nothing new.</Empty>
            )}
          </Panel>
        </section>

        {/* ── Row 2: KPIs — stat tiles (icon chip · value · real ratio meter) ── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {kpiCards.map((k) => {
            const Icon = k.Icon;
            return (
              <Link
                key={k.label}
                href={k.href}
                className="flex flex-col gap-2 rounded-xl p-4 shadow-[var(--cardsh)]"
                style={{ background: "var(--cardbg)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-7 flex-none items-center justify-center rounded-lg"
                    style={{ background: `color-mix(in oklab, var(${k.iconTok}) 14%, transparent)`, color: `var(${k.iconTok})` }}
                  >
                    <Icon className="size-[15px]" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="font-mono rv:font-sans text-[9px] rv:text-overline font-medium uppercase tracking-[1.4px] text-[var(--ink4)]">{k.label}</span>
                </div>
                <div className="font-heading rv:font-data text-[24px] rv:text-data-lg font-bold leading-none tracking-[-.6px] tabular-nums" style={{ color: `var(${k.tok})` }}>{k.value}</div>
                <div className="mt-auto text-[10px] text-[var(--ink4)]">{k.foot}</div>
                {k.meter != null && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--w06)]" role="presentation">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(k.meter * 100)}%`, background: `var(${k.tok})` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </section>

        {/* ── Row 3: Projects table (all projects) ── */}
        <Panel title="Projects" sub={`${d.projects.length}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_92px_120px_120px_74px] items-center gap-3 border-b border-[var(--hair)] p-[9px_18px] font-mono text-[8.5px] uppercase tracking-[1.4px] text-[var(--ink4)]">
            <span>Project</span><span>Health</span><span>Progress</span><span>Owner</span><span>Due</span>
          </div>
          {d.projects.length ? (
            d.projects.map((p) => {
              const m = statusMeta(p.status);
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="grid grid-cols-[minmax(0,1fr)_92px_120px_120px_74px] items-center gap-3 border-b border-[var(--hair2)] p-[10px_18px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                  <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[var(--qink)]">{p.name}</span><span className="font-mono text-[9.5px] text-[var(--ink4)]">{p.code}</span></span>
                  <span className="justify-self-start rounded-[5px] p-[3px_7px] font-mono text-[9px] font-semibold tracking-[.5px]" style={{ color: `var(${m.tok})`, border: `1px solid color-mix(in oklab, var(${m.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${m.tok}) 9%, transparent)` }}>{m.label}</span>
                  <span className="flex items-center gap-2"><span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--wash2)]"><span className="block h-full rounded-full" style={{ width: `${p.avgProgress}%`, background: "var(--brand)" }} /></span><span className="w-8 text-right font-mono text-[10px] tabular-nums text-[var(--ink3)]">{p.avgProgress}%</span></span>
                  <span className="truncate text-[11.5px] text-[var(--ink3)]">{p.ownerName ?? <span className="text-[var(--warn)]">No lead</span>}</span>
                  <span className="font-mono text-[10px] text-[var(--ink4)]">{fmtDate(p.dueDate)}</span>
                </Link>
              );
            })
          ) : (
            <Empty>No projects yet.</Empty>
          )}
        </Panel>

        {/* ── Row 4: Milestones · Risks · Capacity ── */}
        <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Upcoming milestones" sub="NEXT 30 DAYS">
            {d.milestones.length ? d.milestones.map((mi) => (
              <Row key={mi.id} tok={mi.color === "red" ? "--bad" : mi.color === "amber" ? "--warn" : "--ok"} text={mi.text} meta={mi.meta} />
            )) : <Empty>None scheduled.</Empty>}
          </Panel>
          <Panel title="Top risks" sub="BY HEAT">
            {d.topRisks.length ? d.topRisks.map((r) => (
              <Row key={r.id} tok={r.heat >= 15 ? "--bad" : "--warn"} text={r.title} meta={`${r.projectCode ?? "—"} · heat ${r.heat}/25`} href="/risks" />
            )) : <Empty>No open risks.</Empty>}
          </Panel>
          <Panel title="Team capacity" sub="ALLOCATION">
            {d.capacity.length ? d.capacity.map((c) => {
              const over = c.totalPct > 100;
              return (
                <div key={c.userId} className="flex flex-col gap-[5px] p-[7px_16px]">
                  <div className="flex items-center justify-between text-[12px]"><span className="truncate font-medium text-[var(--ink2)]">{c.name}</span><span className="font-mono text-[10.5px] font-semibold tabular-nums" style={{ color: over ? "var(--bad)" : "var(--ink3)" }}>{c.totalPct}%</span></div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--wash2)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, c.totalPct)}%`, background: over ? "var(--bad)" : "var(--brand)" }} /></div>
                </div>
              );
            }) : <Empty>No allocations yet.</Empty>}
          </Panel>
        </section>
      </main>
    </div>
  );
}

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

function Row({ tok, text, meta, href }: { tok: string; text: string; meta: string; href?: string }) {
  const inner = (
    <>
      <span className="w-[3px] flex-none self-stretch rounded-[2px]" style={{ background: `var(${tok})` }} />
      <span className="min-w-0"><span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{text}</span><span className="mt-[3px] block font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{meta}</span></span>
    </>
  );
  const cls = "flex gap-[11px] border-b border-[var(--hair2)] p-[10px_16px] last:border-0";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-[var(--wash)]`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}
