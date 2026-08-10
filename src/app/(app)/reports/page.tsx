import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isoWeekId } from "@/lib/iso-week";
import { getPortfolioSections } from "@/server/pipeline";
import { getRolloutMatrices } from "@/server/rollout";
import { listMyReports } from "@/server/member-reports";
import { listReportIndex } from "@/server/checkins";
import { listRollups } from "@/server/portfolio-reports";
import { MemberReportComposer } from "@/components/reports/member-report-composer";
import { TeamReports } from "@/components/reports/team-reports";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { RolloutHeatmap } from "@/components/dashboard/rollout-heatmap";
import { CheckinQueue } from "@/components/reports/checkin-queue";
import { CARD, RAG_TOKEN } from "@/lib/surface";

// M-P3c (docs/34 §1, docs/25 §6) — the THIN reports index. Authoring lives in the
// workspaces; this page finds, reads and exports. Role-composed:
//  - everyone: "My updates" — their own weekly reports, nobody else's;
//  - PMs (and the Head): their projects' reports, deep-linking into workspace Reports
//    tabs, plus the team ack queue;
//  - reports:read (Head, execs, QA head, PMs): the R1–R3 status summaries and the
//    roll-up archive with CSV export (PDF stays deferred with M9-B — stated, not faked).
// The standalone generate centre RETIRED here — Q's drawer still builds scoped pulls,
// and share links under /reports/s/[token] keep working.

type TabKey = "status" | "markets" | "focus" | "mine" | "team" | "checkins" | "rollups";

type Ctx = { tenantId: string; userId: string; roles: string[]; permissions?: string[] };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx: Ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };

  const isHead = ctx.roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin");
  const leads = isHead || ctx.roles.includes("ProjectManager");
  const canReports = can(ctx, "reports:read");

  const tabs: { key: TabKey; label: string }[] = [
    ...(canReports
      ? [
          { key: "status" as const, label: "Status (R1)" },
          { key: "markets" as const, label: "Markets (R2)" },
          { key: "focus" as const, label: "Focus & blockers (R3)" },
        ]
      : []),
    { key: "mine", label: "My updates" },
    ...(leads
      ? [
          { key: "team" as const, label: "Team reports" },
          { key: "checkins" as const, label: isHead ? "Project check-ins" : "My projects' check-ins" },
        ]
      : []),
    ...(canReports ? [{ key: "rollups" as const, label: "Roll-ups" }] : []),
  ];

  const { tab: requested } = await searchParams;
  const fallback: TabKey = canReports ? "status" : "mine";
  const tab: TabKey = tabs.some((t) => t.key === requested) ? (requested as TabKey) : fallback;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
          Reports
        </div>
        <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Reports</h1>
        <p className="mt-1 text-[12px] text-[var(--ink4)]">
          Reports are written where the work lives — each project&apos;s workspace Reports tab. This index finds, reads and
          exports them.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/reports?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors ${
              t.key === tab
                ? "bg-[var(--brand)] text-[var(--onbrand)]"
                : "border border-[var(--w07)] text-[var(--ink4)] hover:text-[var(--qink)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "status" && <StatusTab ctx={ctx} />}
      {tab === "markets" && <MarketsTab ctx={ctx} />}
      {tab === "focus" && <FocusTab ctx={ctx} />}
      {tab === "mine" && <MineTab ctx={ctx} />}
      {tab === "team" && <TeamReports />}
      {tab === "checkins" && <CheckinsTab ctx={ctx} isHead={isHead} />}
      {tab === "rollups" && <RollupsTab ctx={ctx} isHead={isHead} />}
    </main>
  );
}

/** R1 — live portfolio/project status, global read (§5.2). */
async function StatusTab({ ctx }: { ctx: Ctx }) {
  const [sections, matrices] = await Promise.all([getPortfolioSections(ctx), getRolloutMatrices(ctx)]);
  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        Live delivery status across every portfolio — the same figures the dashboard shows, derived from the one health
        engine.
      </p>
      <PortfolioSections data={sections} matrices={matrices} />
    </>
  );
}

/** R2 — project × market matrix per Rollout portfolio (§5.2). Global read, same engine
 * as the dashboard so the two cannot drift. */
async function MarketsTab({ ctx }: { ctx: Ctx }) {
  const matrices = await getRolloutMatrices(ctx);
  if (!matrices.length) {
    return (
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        <p className="p-4 text-[12px] text-[var(--ink5)]">
          No Rollout portfolios yet. Set a portfolio&apos;s view to Rollout and give its projects market tracks to see the
          matrix here.
        </p>
      </div>
    );
  }
  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        Each Rollout portfolio&apos;s projects against the markets they ship into. A cell shows RAG and week-on-week
        movement; percentages are derived from checkpoint state.
      </p>
      {matrices.map((m) => (
        <div key={m.portfolioId} className={CARD} style={{ background: "var(--cardbg)" }}>
          <div className="border-b border-[var(--hair)] p-[12px_16px]">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{m.portfolioName}</span>
          </div>
          <RolloutHeatmap matrix={m} />
        </div>
      ))}
    </>
  );
}

/** R3 — market focus & blockers: this week's market check-ins, grouped by market (§5.2). */
async function FocusTab({ ctx }: { ctx: Ctx }) {
  const matrices = await getRolloutMatrices(ctx);
  const entries = matrices.flatMap((m) =>
    m.rows.flatMap((row) =>
      row.cells
        .filter((c) => c.narrative)
        .map((c) => ({
          portfolio: m.portfolioName,
          project: row.name,
          market: m.markets.find((mk) => mk.id === c.orgUnitId),
          rag: c.rag,
          narrative: c.narrative!,
        })),
    ),
  );
  const blockers = matrices.flatMap((m) => m.topBlockers.map((b) => ({ ...b, portfolio: m.portfolioName })));

  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        What each market is focused on this week, in the words of the people running it, plus the blockers standing in
        the way.
      </p>
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        <div className="border-b border-[var(--hair)] p-[12px_16px]">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Market check-ins</span>
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">THIS WEEK</span>
        </div>
        {entries.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
            No market check-ins written this week yet.
          </p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[12.5px] font-semibold text-[var(--qink)]">{e.project}</span>
                <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink4)]">
                  {`${e.market?.flag ?? ""} ${e.market?.name ?? ""}`.trim()} · {e.portfolio}
                </span>
                {e.rag && (
                  <span
                    className="ml-auto rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
                    style={{ color: `var(${RAG_TOKEN[e.rag]})`, background: `color-mix(in oklab, var(${RAG_TOKEN[e.rag]}) 10%, transparent)` }}
                  >
                    {e.rag}
                  </span>
                )}
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--ink2)]">{e.narrative}</p>
            </div>
          ))
        )}
      </div>
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        <div className="border-b border-[var(--hair)] p-[12px_16px]">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Open blockers</span>
        </div>
        {blockers.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">No open blockers on rollout projects.</p>
        ) : (
          blockers.map((b) => (
            <div key={b.id} className="flex items-start gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] last:border-0">
              <span className="min-w-0 flex-1 text-[12px] leading-[1.45] text-[var(--ink2)]">{b.description}</span>
              <span className="flex-none font-mono text-[9px] uppercase text-[var(--ink4)]">{b.projectCode}</span>
              <span className="flex-none font-mono text-[9px] tabular-nums text-[var(--ink4)]">{b.ageDays}d</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** My updates — the composer for this week plus my past weeks (mine ONLY, docs/34 §1). */
async function MineTab({ ctx }: { ctx: Ctx }) {
  const currentWeek = isoWeekId(new Date());
  const past = (await listMyReports(ctx)).filter((r) => r.isoWeek !== currentWeek);
  return (
    <>
      <MemberReportComposer />
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        <div className="border-b border-[var(--hair)] p-[12px_16px]">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Past updates</span>
        </div>
        {past.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">No earlier weeks yet.</p>
        ) : (
          past.map((r) => (
            <div key={r.isoWeek} className="flex flex-wrap items-baseline gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <span className="w-[64px] flex-none font-mono text-[10px] text-[var(--ink4)]">{r.isoWeek.replace("-W", " W")}</span>
              <span
                className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
                style={{
                  color: `var(${r.status === "Acknowledged" ? "--ok" : r.status === "Submitted" ? "--qinfo" : "--ink4"})`,
                  background: `color-mix(in oklab, var(${r.status === "Acknowledged" ? "--ok" : r.status === "Submitted" ? "--qinfo" : "--ink4"}) 10%, transparent)`,
                }}
              >
                {r.status}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-[var(--ink3)]">
                {r.projects.map((p, i) => (
                  <span key={p.projectId}>
                    {i > 0 && " · "}
                    <Link href={`/projects/${p.projectId}?tab=Reports`} className="hover:text-[var(--qink)] hover:underline">
                      {p.projectCode}
                    </Link>
                  </span>
                ))}
                {r.narrative && <span className="ml-2 italic text-[var(--ink4)]">“{r.narrative}”</span>}
              </span>
              {r.acks > 0 && (
                <span className="flex-none font-mono text-[9px] font-bold uppercase tracking-[.8px] text-[var(--ok)]">
                  {r.acks} ack{r.acks === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** Check-ins — the per-project queue, grouped into portfolio tabs (M-D2). This moved off
 * the exec dashboard, which now shows only the shape of the week and links here. */
async function CheckinsTab({ ctx, isHead }: { ctx: Ctx; isHead: boolean }) {
  const rows = await listReportIndex(ctx);
  return <CheckinQueue rows={rows} isHead={isHead} />;
}

/** Roll-ups — the archive of the Head's weekly roll-up: CSV export now, PDF deferred
 * with M9-B (stated, never faked). Building and approving live on the Head's dashboard. */
async function RollupsTab({ ctx, isHead }: { ctx: Ctx; isHead: boolean }) {
  const rows = await listRollups(ctx);
  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        The Head of PMs&apos; weekly roll-up, week by week — frozen at approval, exactly as signed.
        {isHead && " Build and approve this week's from your dashboard."}
        {" "}PDF export lands with M9-B; CSV is what ships today.
      </p>
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        {rows.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
            No approved roll-ups yet{isHead ? " — build this week's from your dashboard." : "."}
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.isoWeek} className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <span className="w-[64px] flex-none font-mono text-[10px] text-[var(--ink4)]">{r.isoWeek.replace("-W", " W")}</span>
              <span
                className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
                style={{
                  color: `var(${r.status === "Approved" ? "--ok" : "--warn"})`,
                  background: `color-mix(in oklab, var(${r.status === "Approved" ? "--ok" : "--warn"}) 10%, transparent)`,
                }}
              >
                {r.status}
              </span>
              <span className="flex-none font-mono text-[10px] tabular-nums text-[var(--ink4)]">{r.projects} projects</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">
                {r.narrative ?? <span className="text-[var(--ink5)]">no narrative yet</span>}
              </span>
              {r.approvedByName && (
                <span className="flex-none text-[10.5px] text-[var(--ink4)]">
                  signed {r.approvedByName}
                  {r.approvedAt && ` · ${r.approvedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </span>
              )}
              <a
                href={`/api/rollup/export?week=${r.isoWeek}`}
                className="flex-none rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
              >
                CSV ↓
              </a>
            </div>
          ))
        )}
      </div>
    </>
  );
}
