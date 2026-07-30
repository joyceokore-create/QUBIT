import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { listWorkload } from "@/server/resources";
import { getPortfolioSections } from "@/server/pipeline";
import { getRolloutMatrices } from "@/server/rollout";
import { MemberReportComposer } from "@/components/reports/member-report-composer";
import { TeamReports } from "@/components/reports/team-reports";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { RolloutHeatmap } from "@/components/dashboard/rollout-heatmap";
import { ReportsClient } from "./reports-client";

// Reports centre (docs/18 §5.2). Four surfaces behind one tab strip:
//  - status (R1): portfolio/project status, readable by EVERYONE — it summarises
//    globally-readable tenant data and reuses the dashboard's own sections, so the two
//    can never drift. R2/R3 market matrices join with M-D.
//  - mine: the member's weekly report composer (§5.1) — draft → edit → send.
//  - team: reports submitted to me as a project lead, acknowledged per project.
//  - generate: the existing Q report builder; scoped pulls stay gated by canAccessReport.

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)]";
const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

const TABS = [
  { key: "status", label: "Status (R1)" },
  { key: "markets", label: "Markets (R2)" },
  { key: "focus", label: "Focus & blockers (R3)" },
  { key: "mine", label: "My weekly report" },
  { key: "team", label: "Team reports" },
  { key: "generate", label: "Generate" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const canReports = can(ctx, "reports:read");

  const { tab: requested } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "status";

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
          Reports centre
        </div>
        <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Reports</h1>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
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
      {tab === "mine" && <MemberReportComposer />}
      {tab === "team" && <TeamReports />}
      {tab === "generate" && (
        <GenerateTab
          ctx={ctx}
          canReports={canReports}
          me={{ id: session.user.id, name: session.user.name ?? "You" }}
          tenantName={session.user.tenantName}
        />
      )}
    </main>
  );
}

/** R1 — live portfolio/project status, global read (§5.2). */
async function StatusTab({ ctx }: { ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] } }) {
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
async function MarketsTab({ ctx }: { ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] } }) {
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
async function FocusTab({ ctx }: { ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] } }) {
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

async function GenerateTab({
  ctx,
  canReports,
  me,
  tenantName,
}: {
  ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] };
  canReports: boolean;
  me: { id: string; name: string };
  tenantName: string;
}) {
  const [projects, people] = canReports
    ? await Promise.all([listProjects(ctx, {}), listWorkload(ctx)])
    : [[], []];
  return (
    <ReportsClient
      canReports={canReports}
      me={me}
      tenantName={tenantName}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      people={people.map((p) => ({ id: p.userId, name: p.name, department: p.departmentName }))}
    />
  );
}
