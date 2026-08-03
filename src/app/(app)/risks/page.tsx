import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listRisks } from "@/server/risks";
import { ExportButton } from "@/components/export-button";
import { listIssues } from "@/server/issues";
import { getGapReport } from "@/server/raid";
import { listUsers } from "@/server/users";
import { listProjects } from "@/server/projects";
import { RiskTable } from "@/components/raid/risk-table";
import { IssueTable } from "@/components/raid/issue-table";
import { GapReportView } from "@/components/raid/gap-report-view";
import { NewRiskDialog } from "@/components/raid/new-risk-dialog";

export default async function RisksPage() {
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
        <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Risks & Issues" }]} />
        <Forbidden />
      </div>
    );
  }

  const canReadIssues = can(ctx, "issue:read");
  const [risks, issues, gapReport, users, projects] = await Promise.all([
    listRisks(ctx),
    canReadIssues ? listIssues(ctx) : Promise.resolve([]),
    canReadIssues ? getGapReport(ctx) : Promise.resolve({ totalIssues: 0, gapCount: 0, traced: 0, items: [] }),
    listUsers(ctx),
    listProjects(ctx),
  ]);

  const canCreateRisk = can(ctx, "risk:create");
  const canUpdateRisk = can(ctx, "risk:update");
  const canUpdateIssue = can(ctx, "issue:update");

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Risks & Issues" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] rv:text-heading-md font-bold tracking-[-0.5px] text-foreground">
            Risks &amp; Issues
          </h1>
          <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">{risks.length} risks in this organization</p>
        </div>
        <ExportButton href="/api/export?kind=risks" />
        {canCreateRisk && (
          <NewRiskDialog users={users} projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))} />
        )}
      </div>

      <Tabs defaultValue="risks">
        <TabsList>
          <TabsTrigger value="risks">Risks</TabsTrigger>
          {canReadIssues && <TabsTrigger value="issues">Issues</TabsTrigger>}
          {canReadIssues && <TabsTrigger value="gap-report">Gap Report</TabsTrigger>}
        </TabsList>
        <TabsContent value="risks" className="mt-[18px]">
          <RiskTable risks={risks} users={users} canUpdate={canUpdateRisk} viewerId={ctx.userId} />
        </TabsContent>
        {canReadIssues && (
          <TabsContent value="issues" className="mt-[18px]">
            <IssueTable issues={issues} users={users} canUpdate={canUpdateIssue} />
          </TabsContent>
        )}
        {canReadIssues && (
          <TabsContent value="gap-report" className="mt-[18px]">
            <GapReportView report={gapReport} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
