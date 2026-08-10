import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isoWeekId } from "@/lib/iso-week";
import { getMarketFocus } from "@/server/rollout";
import { listMyReports } from "@/server/member-reports";
import { listReportIndex } from "@/server/checkins";
import { getRollup, listRollups } from "@/server/portfolio-reports";
import { listShares } from "@/server/q/shares";
import { MemberReportComposer } from "@/components/reports/member-report-composer";
import { TeamReports } from "@/components/reports/team-reports";
import { CheckinQueue } from "@/components/reports/checkin-queue";
import { RollupStrip } from "@/components/dashboard/rollup-strip";
import { ExportButton } from "@/components/export-button";
import { CARD, RAG_TOKEN } from "@/lib/surface";

// M-P3c (docs/34 §1, docs/25 §6) — the THIN reports index. "My updates" is the member's
// cross-project weekly composer; per-project authoring lives in each workspace's Reports
// tab; everything else here finds, reads and exports. Role-composed:
//  - everyone: "My updates" — their own weekly reports, nobody else's;
//  - PMs (and the Head): their projects' reports plus the team ack queue;
//  - reports:read (Head, execs, QA head, PMs): market focus & blockers, the roll-up
//    archive with CSV export, and the shared weekly reports.
// DM1.73 (T1): the Status and Markets tabs are GONE — they rendered the exact components
// the dashboard already shows (PortfolioSections / RolloutHeatmap); a duplicate surface
// is a drift risk, not a feature. DM1.73 (T2): the Head builds/approves the roll-up here
// too, not only from the executive dashboard persona.

type TabKey = "mine" | "team" | "checkins" | "focus" | "rollups";

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

  // DM1.73 (T1): 5 tabs, de-jargoned — no internal R1/R2/R3 codenames in the chrome.
  const tabs: { key: TabKey; label: string }[] = [
    { key: "mine", label: "My updates" },
    ...(leads
      ? [
          { key: "team" as const, label: "Team reports" },
          { key: "checkins" as const, label: "Check-ins" },
        ]
      : []),
    ...(canReports
      ? [
          { key: "focus" as const, label: "Focus & blockers" },
          { key: "rollups" as const, label: "Roll-ups" },
        ]
      : []),
  ];

  const { tab: requested } = await searchParams;
  const tab: TabKey = tabs.some((t) => t.key === requested) ? (requested as TabKey) : "mine";

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
          Reports
        </div>
        <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Reports</h1>
        <p className="mt-1 text-[12px] text-[var(--ink4)]">
          Your cross-project weekly update is written here under My updates; per-project reports are written in each
          project&apos;s workspace Reports tab. The rest of this index finds, reads and exports.
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

      {tab === "mine" && <MineTab ctx={ctx} />}
      {tab === "team" && <TeamReports />}
      {tab === "checkins" && <CheckinsTab ctx={ctx} isHead={isHead} />}
      {tab === "focus" && <FocusTab ctx={ctx} />}
      {tab === "rollups" && <RollupsTab ctx={ctx} isHead={isHead} />}
    </main>
  );
}

/** Focus & blockers — this week's market check-ins, grouped by market (§5.2).
 * DM1.73 (T1): the data shaping moved to getMarketFocus in src/server/rollout.ts —
 * this component just renders the rows. */
async function FocusTab({ ctx }: { ctx: Ctx }) {
  const { entries, blockers } = await getMarketFocus(ctx);

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
          entries.map((e) => (
            <div key={e.key} className="flex flex-col gap-1 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[12.5px] font-semibold text-[var(--qink)]">{e.project}</span>
                <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink4)]">
                  {`${e.marketFlag ?? ""} ${e.marketName}`.trim()} · {e.portfolio}
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

/** Roll-ups — the archive of the Head's weekly roll-up, plus (DM1.73 T2) the Head's own
 * build/approve strip: no more switching to the executive dashboard persona to sign the
 * week. Server PDF stays deferred with M9-B (stated, never faked). */
async function RollupsTab({ ctx, isHead }: { ctx: Ctx; isHead: boolean }) {
  const [rows, shares, rollup] = await Promise.all([
    listRollups(ctx),
    listShares(ctx),
    isHead ? getRollup(ctx) : Promise.resolve(null),
  ]);
  return (
    <>
      {/* DM1.73 (T2): the same strip the Head's dashboard renders — one component,
          two doors, zero drift. */}
      {isHead && rollup && <RollupStrip rollup={rollup} />}
      <p className="text-[12.5px] text-[var(--ink3)]">
        The Head of PMs&apos; weekly roll-up, week by week — frozen at approval, exactly as signed. Server-rendered PDF
        lands with M9-B; today each week exports as CSV, and shared reports download as print-ready HTML (print to PDF
        from the browser).
      </p>
      {/* DM1.73 (T3): the /api/export CSVs existed with permission scoping but had no
          door on this page — a subtle strip, links only, the server decides the scope. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">Exports</span>
        <ExportButton href="/api/export?kind=projects" label="Projects CSV" />
        <ExportButton href="/api/export?kind=risks" label="Risks CSV" />
        <ExportButton href="/api/export?kind=allocations" label="Allocations CSV" />
      </div>
      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        {rows.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
            No approved roll-ups yet{isHead ? " — build and approve this week's above." : "."}
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
      {/* DM1.73 (T7): the Friday SharedReports were reachable only via the emailed
          link — listed here so a lost email no longer loses the report. */}
      {shares.length > 0 && (
        <div className={CARD} style={{ background: "var(--cardbg)" }}>
          <div className="border-b border-[var(--hair)] p-[12px_16px]">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Weekly reports</span>
            <span className="ml-2 font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">SHARED SNAPSHOTS</span>
          </div>
          {shares.map((s) => (
            <div key={s.token} className="flex flex-wrap items-baseline gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <Link
                href={`/reports/s/${s.token}`}
                className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] hover:underline"
              >
                {s.title}
              </Link>
              <span className="flex-none font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)]">{s.type}</span>
              <span className="flex-none font-mono text-[10px] text-[var(--ink4)]">
                {s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
