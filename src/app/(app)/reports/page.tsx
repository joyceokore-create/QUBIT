import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { listWorkload } from "@/server/resources";
import { getPortfolioSections } from "@/server/pipeline";
import { MemberReportComposer } from "@/components/reports/member-report-composer";
import { TeamReports } from "@/components/reports/team-reports";
import { PortfolioSections } from "@/components/dashboard/portfolio-sections";
import { ReportsClient } from "./reports-client";

// Reports centre (docs/18 §5.2). Four surfaces behind one tab strip:
//  - status (R1): portfolio/project status, readable by EVERYONE — it summarises
//    globally-readable tenant data and reuses the dashboard's own sections, so the two
//    can never drift. R2/R3 market matrices join with M-D.
//  - mine: the member's weekly report composer (§5.1) — draft → edit → send.
//  - team: reports submitted to me as a project lead, acknowledged per project.
//  - generate: the existing Q report builder; scoped pulls stay gated by canAccessReport.

const TABS = [
  { key: "status", label: "Status (R1)" },
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
  const sections = await getPortfolioSections(ctx);
  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        Live delivery status across every portfolio — the same figures the dashboard shows, derived from the one health
        engine. Market matrices (R2/R3) arrive with the delivery milestone.
      </p>
      <PortfolioSections data={sections} />
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
