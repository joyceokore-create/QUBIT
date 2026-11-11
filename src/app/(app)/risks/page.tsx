import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/list/page-header";
import { TabStrip } from "@/components/ui/tab-strip";
import { NewRiskDialog } from "@/components/raid/new-risk-dialog";
import { NewIssueButton } from "@/components/raid/new-issue-drawer";
import { SEVERITY_ORDER } from "@/components/raid/severity";
import { parseListParams } from "@/lib/list-state";
import { listRisksPage, RISK_STATUSES } from "@/server/risks";
import { ISSUE_STATUS_FILTERS, listIssuesPage } from "@/server/issues";
import { raidFacets, raidTabCounts, type RaidTab } from "@/server/raid";
import { listUsers } from "@/server/users";
import { listProjects } from "@/server/projects";
import { RisksClient } from "./risks-client";

// UX5 (L1–L5) — Risks · Issues · Gap report. Every tab pages, searches and filters ON THE
// SERVER: the URL (tab, q, page, size, project, severity, status, owner) is allow-listed by
// parseListParams, re-validated with Zod inside listRisksPage / listIssuesPage, and run as
// parameterised Prisma under the tenant's RLS context. Switching tab is a plain link that
// drops the other tab's search, filters and page (each tab has its own statuses and owners).

type SearchParams = Record<string, string | string[] | undefined>;

export default async function RisksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  if (!can(ctx, "risk:read")) {
    return (
      <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
        <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Risks & Issues" }]} />
        <Forbidden />
      </div>
    );
  }

  const canReadIssues = can(ctx, "issue:read");
  const canCreateRisk = can(ctx, "risk:create");
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: RaidTab = canReadIssues && (rawTab === "issues" || rawTab === "gap") ? rawTab : "risks";
  const statuses = tab === "risks" ? RISK_STATUSES : ISSUE_STATUS_FILTERS;
  const canUpdate = tab === "risks" ? can(ctx, "risk:update") : tab === "issues" && can(ctx, "issue:update");

  const params = parseListParams(sp, {
    defaultSize: 10,
    filters: { project: "id", owner: "id", status: statuses, severity: SEVERITY_ORDER },
  });
  const query = {
    q: params.q,
    page: params.page,
    size: params.size,
    projectId: params.filters.project,
    ownerId: params.filters.owner,
    status: params.filters.status,
    severity: params.filters.severity,
  };

  const [counts, facets, page, users, projects] = await Promise.all([
    raidTabCounts(ctx, canReadIssues),
    raidFacets(ctx, tab),
    tab === "risks"
      ? listRisksPage(ctx, query).then((p) => ({ tab, ...p }) as const)
      : listIssuesPage(ctx, { ...query, gap: tab === "gap" }).then((p) => ({ tab, ...p })),
    // Users feed the owner pickers in the create / edit dialogs.
    canCreateRisk || canUpdate ? listUsers(ctx) : Promise.resolve([]),
    canCreateRisk ? listProjects(ctx) : Promise.resolve([]),
  ]);

  // UX fidelity Tier 2: "+ New Issue" on the Issues tabs (issue:create, or project contributors).
  const canCreateIssue = canReadIssues && can(ctx, "issue:create");
  const newIssue = canCreateIssue && tab !== "risks" ? <NewIssueButton projects={(await listProjects(ctx)).map((p) => ({ id: p.id, code: p.code, name: p.name }))} users={(users.length ? users : await listUsers(ctx)).map((u) => ({ id: u.id, name: u.name }))} /> : undefined;
  // The top bar's "+ New › Risk" lands here with ?new=1 (UX fidelity F1).
  const newRisk = canCreateRisk ? <NewRiskDialog users={users} projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))} defaultOpen={sp.new === "1"} /> : undefined;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const description =
    tab === "risks"
      ? `${plural(counts.risks, "risk", "risks")} in this organization.`
      : tab === "issues"
        ? `${plural(counts.issues, "issue", "issues")}, raised directly or materialised from a risk.`
        : `${counts.gaps} of ${plural(counts.issues, "issue", "issues")} had no owned, mitigated risk behind them · ${counts.issues - counts.gaps} traced.`;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={session.user.tenantName}
        title="Risks & Issues"
        description={description}
        actions={
          <>
            <ExportButton href="/api/export?kind=risks" label="Export risks CSV" />
            {tab === "risks" ? newRisk : newIssue}
          </>
        }
      />

      <TabStrip
        label="Risks and issues views"
        active={tab}
        tabs={[
          { key: "risks", label: "Risks", href: "/risks", count: counts.risks },
          ...(canReadIssues
            ? [
                { key: "issues", label: "Issues", href: "/risks?tab=issues", count: counts.issues },
                { key: "gap", label: "Gap Report", href: "/risks?tab=gap" },
              ]
            : []),
        ]}
      />

      <RisksClient
        key={tab}
        data={page}
        info={page.info}
        facets={facets}
        statuses={statuses}
        severities={SEVERITY_ORDER}
        canUpdate={canUpdate}
        viewerId={ctx.userId}
        users={users}
        createAction={newRisk}
      />
    </main>
  );
}
