import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { forTenant } from "@/server/tenant-db";
import { listProjects, type ProjectListItem } from "@/server/projects";
import { getEscalations, getUpcomingMilestones } from "@/server/dashboard";
import { listWorkload } from "@/server/resources";
import { Forbidden } from "@/components/forbidden";
import { LiveClock } from "@/components/command/live-clock";
import { gateCells, projectRank as rank, statusBarTok as barTok, statusMeta } from "@/lib/project-view";

// ── QUBIT App v3 dashboard — the "command center". Glass cards over the ambient field,
// grounded entirely in live tenant data (RLS): a briefing hero with a health ring, a KPI
// strip, the Delivery ledger (grouped, with an 8-cell gate strip derived from progress +
// status), and Signals / Milestones / Workload rails.

function roleLabel(roles: string[]): string {
  if (roles.includes("PlatformSuperAdmin")) return "Super Admin";
  if (roles.includes("HeadOfProjects")) return "Head of Projects";
  if (roles.includes("HeadOfQA")) return "Head of QA";
  if (roles.includes("Executive")) return "Executive";
  if (roles.includes("ProjectManager")) return "Project Manager";
  return "Member";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const [projects, escalations, milestones, workload, memberCounts] = await Promise.all([
    listProjects(ctx),
    getEscalations(ctx, 5),
    getUpcomingMilestones(ctx, 5),
    listWorkload(ctx),
    forTenant(ctx, (tx) => tx.projectMember.groupBy({ by: ["projectId"], _count: { _all: true } })),
  ]);

  const countByProject = new Map(memberCounts.map((r) => [r.projectId, r._count._all]));
  const by = (s: string) => projects.filter((p) => p.status === s).length;
  const total = projects.length;
  const onTrack = by("OnTrack");
  const atRisk = by("AtRisk");
  const overdue = by("Overdue");
  const planning = by("Planning");
  const completed = by("Completed");
  const needAttention = atRisk + overdue;
  const health = total ? Math.round(((onTrack + completed) / total) * 100) : 0;
  const peopleAllocated = workload.filter((w) => w.projectCount > 0).length;
  const overAllocated = workload.filter((w) => w.totalPct > 100);

  const firstName = (session.user.name ?? "there").split(/\s+/)[0];
  const role = roleLabel(session.user.roles);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  // Attention list: worst-status projects first.
  const attention = projects
    .filter((p) => p.status === "AtRisk" || p.status === "Overdue")
    .sort((a, b) => rank(b.status) - rank(a.status) || a.avgProgress - b.avgProgress)
    .slice(0, 3);
  const topAttention = attention[0];

  // Delivery ledger groups (only non-empty render).
  const toRow = (p: ProjectListItem) => {
    const m = statusMeta(p.status);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      sub: `${p.type} · ${p.priority} priority`,
      pct: p.avgProgress,
      cells: gateCells(p.avgProgress, p.status),
      barTok: barTok(p.status),
      statusLabel: m.label,
      statusTok: m.tok,
      members: countByProject.get(p.id) ?? 0,
    };
  };
  const groupDefs: { label: string; tok: string; match: (s: string) => boolean }[] = [
    { label: "Needs attention", tok: "--bad", match: (s) => s === "AtRisk" || s === "Overdue" },
    { label: "On track", tok: "--ok", match: (s) => s === "OnTrack" || s === "Completed" },
    { label: "Planning", tok: "--qinfo", match: (s) => s === "Planning" || s === "Cancelled" },
  ];
  const groups = groupDefs
    .map((g) => ({
      ...g,
      rows: projects
        .filter((p) => g.match(p.status))
        .sort((a, b) => rank(b.status) - rank(a.status) || a.name.localeCompare(b.name))
        .map(toRow),
    }))
    .filter((g) => g.rows.length > 0);

  const kpis = [
    { label: "Projects", value: total, tok: "--qink", href: "/projects" },
    { label: "On track", value: onTrack, tok: "--ok", href: "/projects" },
    { label: "At risk", value: atRisk, tok: "--warn", href: "/projects" },
    { label: "Overdue", value: overdue, tok: "--bad", href: "/projects" },
    { label: "Planning", value: planning, tok: "--qinfo", href: "/projects" },
    { label: "People", value: peopleAllocated, tok: "--qink", href: "/people" },
  ];

  const C = 2 * Math.PI * 52; // health ring circumference (r=52)
  const dash = (Math.max(0, Math.min(100, health)) / 100) * C;

  return (
    <div>
      {/* Group overview strip */}
      <div className="mx-auto flex w-full max-w-[1360px] items-baseline gap-3.5 px-6 pt-[18px] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <span className="font-mono text-[10.5px] font-semibold tracking-[2.4px] text-[var(--ink4)]">GROUP OVERVIEW</span>
        <span className="-translate-y-[3px] flex-1 border-b border-[var(--hair2)]" />
        <span className="font-mono text-[10.5px] tracking-[1px] text-[var(--ink4)]">{today}</span>
        <LiveClock />
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[1.5px] text-[var(--ok)]">
          <span className="size-1.5 rounded-full bg-[var(--ok)] [animation:pulseGlow_2.6s_infinite]" />
          LIVE
        </span>
      </div>

      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[14px_24px_90px]">
        {/* ── Briefing hero ── */}
        <section
          className="relative overflow-hidden rounded-[18px] border border-[var(--cardbd)] p-[26px_28px] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.04s_both]"
          style={{ background: "var(--cardbg)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(900px 340px at 8% -50%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 62%)" }}
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
            {/* greeting */}
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-[9px]">
                <span className="size-[7px] rounded-full bg-[var(--brand)] [animation:pulseGlow_2.4s_infinite]" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[2.2px] text-brand">{role} · {session.user.tenantName}</span>
              </div>
              <h1 className="mb-2.5 font-heading text-[34px] font-bold leading-[1.08] tracking-[-1.1px] text-[var(--qink)]">Good morning, {firstName}.</h1>
              <p className="mb-[18px] max-w-[430px] text-[14.5px] leading-[1.55] text-[var(--ink3)]">
                {needAttention > 0 ? (
                  <>
                    {needAttention} {needAttention === 1 ? "project needs" : "projects need"} your attention
                    {attention.length ? (
                      <> — {attention.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 ? ", " : ""}
                          <span className="font-semibold text-[var(--qink)]">{p.name}</span>
                        </span>
                      ))}.</>
                    ) : "."}
                  </>
                ) : total > 0 ? (
                  <>All {total} projects are tracking cleanly. Portfolio health is <span className="font-semibold text-[var(--qink)]">{health}</span>.</>
                ) : (
                  <>Let&apos;s onboard your first projects — create one from the Projects tab.</>
                )}
              </p>
              <div className="flex flex-wrap gap-[18px]">
                {topAttention && <HeroLink href={`/projects/${topAttention.id}`} label={`Open ${topAttention.name}`} />}
                <HeroLink href="/projects" label="All projects" />
                <HeroLink href="/my-tasks" label="My tasks" />
              </div>
            </div>

            {/* attention list */}
            <div className="flex min-w-0 flex-col border-t border-[var(--hair2)]">
              {attention.length ? (
                attention.map((p) => {
                  const m = statusMeta(p.status);
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-start gap-[11px] border-b border-[var(--hair2)] p-[11px_4px] transition-[transform,background] duration-200 hover:translate-x-1 hover:bg-[var(--wash)]"
                    >
                      <span className="mt-[5px] h-[26px] w-[3px] flex-none rounded-[2px]" style={{ background: `var(${m.tok})` }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-[var(--ink2)]">{p.name}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">{p.code} · {m.label} · {p.avgProgress}%</span>
                      </span>
                      <ArrowRight className="mt-2 size-3 flex-none text-[var(--ink5)]" />
                    </Link>
                  );
                })
              ) : (
                <div className="p-[11px_4px] text-[12.5px] text-[var(--ink4)]">Nothing at risk or overdue.</div>
              )}
            </div>

            {/* health ring */}
            <div className="flex flex-none flex-col items-center gap-3">
              <div className="relative size-[138px]">
                <svg width="138" height="138" viewBox="0 0 138 138">
                  <circle cx="69" cy="69" r="58" style={{ fill: "none", stroke: "var(--hair)", strokeWidth: 2 }} />
                  <circle cx="69" cy="69" r="52" transform="rotate(-90 69 69)" style={{ fill: "none", stroke: "var(--wash2)", strokeWidth: 8 }} />
                  <circle
                    cx="69"
                    cy="69"
                    r="52"
                    transform="rotate(-90 69 69)"
                    style={{
                      fill: "none",
                      stroke: "var(--brand)",
                      strokeWidth: 8,
                      strokeLinecap: "round",
                      strokeDasharray: `${dash} ${C}`,
                      animation: "arcIn 1.2s cubic-bezier(.22,1,.36,1) .3s both",
                      filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--brand) 45%, transparent))",
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-px">
                  <div className="font-heading text-[36px] font-extrabold leading-none tracking-[-1px] tabular-nums text-[var(--qink)]">{health}</div>
                  <div className="font-mono text-[8.5px] tracking-[2.2px] text-[var(--ink4)]">HEALTH</div>
                </div>
              </div>
              <div className="w-[150px]">
                <div className="flex h-[5px] gap-[2px] overflow-hidden rounded-full">
                  <span style={{ width: `${total ? (onTrack / total) * 100 : 0}%`, background: "var(--ok)" }} />
                  <span style={{ width: `${total ? (needAttention / total) * 100 : 0}%`, background: "var(--warn)" }} />
                  <span style={{ width: `${total ? (planning / total) * 100 : 0}%`, background: "var(--qinfo)" }} />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[.6px]">
                  <span className="text-[var(--ok)]">{onTrack} ON</span>
                  <span className="text-[var(--warn)]">{needAttention} RISK</span>
                  <span className="text-[var(--qinfo)]">{planning} PLAN</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── KPI strip ── */}
        <section
          className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] md:grid-cols-6 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]"
          style={{ background: "var(--cardbg)" }}
        >
          {kpis.map((k, i) => (
            <Link
              key={k.label}
              href={k.href}
              className="p-[16px_20px] transition-colors hover:bg-[var(--wash)]"
              style={{ borderLeft: i === 0 ? "none" : "1px solid var(--hair2)" }}
            >
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[1.8px] text-[var(--ink4)]">{k.label}</div>
              <div className="mt-1.5 font-heading text-[30px] font-bold leading-none tracking-[-.8px] tabular-nums" style={{ color: `var(${k.tok})` }}>{k.value}</div>
            </Link>
          ))}
        </section>

        {/* ── Delivery ledger + rails ── */}
        <section className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_344px]">
          <div
            className="overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.16s_both]"
            style={{ background: "var(--cardbg)" }}
          >
            <div className="flex items-center gap-3.5 border-b border-[var(--hair)] p-[14px_18px]">
              <span className="font-heading text-[15px] font-bold tracking-[-.3px] text-[var(--qink)]">Delivery ledger</span>
              <span className="font-mono text-[10px] tracking-[1px] text-[var(--ink4)]">{total} {total === 1 ? "PROJECT" : "PROJECTS"}</span>
              <span className="flex-1" />
              <span className="hidden items-center gap-2.5 font-mono text-[9px] tracking-[.8px] text-[var(--ink4)] sm:flex">
                <Legend tok="--stD" label="PASSED" />
                <Legend tok="--stA" label="ACTIVE" />
                <Legend tok="--stL" label="LATE" />
                <Legend tok="--stP" label="PENDING" />
              </span>
            </div>
            {groups.length ? (
              groups.map((g) => (
                <div key={g.label}>
                  <div className="flex items-center gap-2.5 border-b border-[var(--hair2)] bg-[var(--wash)] p-[7px_18px]">
                    <span className="size-1.5 rounded-[2px]" style={{ background: `var(${g.tok})` }} />
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[2px] text-[var(--ink3)]">{g.label}</span>
                    <span className="font-mono text-[9.5px] text-[var(--ink5)]">{g.rows.length}</span>
                  </div>
                  {g.rows.map((r) => (
                    <Link
                      key={r.id}
                      href={`/projects/${r.id}`}
                      className="grid grid-cols-[96px_62px_minmax(0,1fr)_118px_82px_30px] items-center gap-3.5 border-b border-[var(--hair2)] p-[10px_18px] transition-[transform,background] duration-200 last:border-0 hover:translate-x-[3px] hover:bg-[var(--wash)]"
                    >
                      <GateStrip cells={r.cells} />
                      <span className="font-mono text-[10.5px] tracking-[.5px] text-[var(--ink4)]">{r.code}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold tracking-[-.1px] text-[var(--qink)]">{r.name}</span>
                        <span className="block truncate text-[11px] text-[var(--ink4)]">{r.sub}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                          <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: `var(${r.barTok})` }} />
                        </span>
                        <span className="w-[30px] text-right font-mono text-[10.5px] tabular-nums text-[var(--ink3)]">{r.pct}%</span>
                      </span>
                      <span
                        className="justify-self-start rounded-[5px] p-[3px_7px] font-mono text-[9px] font-semibold tracking-[1px]"
                        style={{ color: `var(${r.statusTok})`, border: `1px solid color-mix(in oklab, var(${r.statusTok}) 35%, transparent)`, background: `color-mix(in oklab, var(${r.statusTok}) 9%, transparent)` }}
                      >
                        {r.statusLabel}
                      </span>
                      <span className="text-right font-mono text-[10.5px] text-[var(--ink4)]">{r.members}</span>
                    </Link>
                  ))}
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-[13px] text-[var(--ink4)]">No projects yet. Create one from the Projects tab.</div>
            )}
          </div>

          <aside className="flex flex-col gap-3.5">
            <Rail title="Signals" sub="RISKS & ISSUES" delay=".2s">
              {escalations.length ? (
                escalations.map((e) => <RailRow key={e.id} tok={e.color === "red" ? "--bad" : "--warn"} text={e.title} meta={`${e.kind.toUpperCase()} · ${e.meta}`} glow />)
              ) : (
                <Empty>No open risks or issues.</Empty>
              )}
            </Rail>

            <Rail title="Milestones" sub="NEXT 30 DAYS" delay=".24s">
              {milestones.length ? (
                milestones.map((m) => <RailRow key={m.id} tok={m.color === "red" ? "--bad" : m.color === "amber" ? "--warn" : "--ok"} text={m.text} meta={m.meta} />)
              ) : (
                <Empty>No milestones scheduled.</Empty>
              )}
            </Rail>

            <Rail title="Workload" sub="ALLOCATION" delay=".28s">
              {peopleAllocated ? (
                workload
                  .filter((w) => w.projectCount > 0)
                  .sort((a, b) => b.totalPct - a.totalPct)
                  .slice(0, 5)
                  .map((w) => {
                    const over = w.totalPct > 100;
                    return (
                      <div key={w.userId} className="flex flex-col gap-[5px] p-[7px_16px]">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="truncate font-medium text-[var(--ink2)]">{w.name}</span>
                          <span className="font-mono text-[10.5px] font-semibold tabular-nums" style={{ color: over ? "var(--bad)" : "var(--ink3)" }}>{w.totalPct}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, w.totalPct)}%`, background: over ? "var(--bad)" : "var(--brand)", boxShadow: `0 0 6px color-mix(in oklab, ${over ? "var(--bad)" : "var(--brand)"} 35%, transparent)` }} />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <Empty>No allocations yet.</Empty>
              )}
              {overAllocated.length > 0 && (
                <div className="px-4 pb-2.5 pt-1 font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--bad)]">
                  {overAllocated.length} over-allocated
                </div>
              )}
            </Rail>
          </aside>
        </section>
      </main>
    </div>
  );
}

function HeroLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 border-b border-[color-mix(in_oklab,var(--brand)_35%,transparent)] pb-0.5 text-[12.5px] font-semibold text-brand transition-colors hover:border-[var(--brand)]"
    >
      {label} <ArrowRight className="size-3" />
    </Link>
  );
}

function GateStrip({ cells }: { cells: string[] }) {
  return (
    <span className="flex gap-[3px]">
      {cells.map((tok, i) => (
        <span key={i} className="size-2 rounded-[2px]" style={{ background: `var(${tok})` }} />
      ))}
    </span>
  );
}

function Legend({ tok, label }: { tok: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-[7px] rounded-[2px]" style={{ background: `var(${tok})` }} />
      {label}
    </span>
  );
}

function Rail({ title, sub, delay, children }: { title: string; sub: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]"
      style={{ background: "var(--cardbg)", animation: `rise .55s cubic-bezier(.22,1,.36,1) ${delay} both` }}
    >
      <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[13px_16px]">
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{title}</span>
        <span className="font-mono text-[9.5px] tracking-[1.2px] text-[var(--ink4)]">{sub}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function RailRow({ tok, text, meta, glow }: { tok: string; text: string; meta: string; glow?: boolean }) {
  return (
    <div className="flex gap-[11px] border-b border-[var(--hair2)] p-[11px_16px] last:border-0">
      <span
        className="w-[3px] flex-none self-stretch rounded-[2px]"
        style={{ background: `var(${tok})`, boxShadow: glow ? `0 0 8px color-mix(in oklab, var(${tok}) 40%, transparent)` : "none" }}
      />
      <span className="min-w-0">
        <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{text}</span>
        <span className="mt-[3px] block font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{meta}</span>
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[11px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}
