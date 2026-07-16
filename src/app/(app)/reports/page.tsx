import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listProjects } from "@/server/projects";
import { listWorkload } from "@/server/resources";
import { ReportsClient } from "./reports-client";

// Reports centre (MVP1). Everyone can export their own weekly/monthly report; users with
// `reports:read` (Project Managers, Executives, Portfolio Managers, admins) can also export
// per-project (weekly/monthly) and per-person reports. Reports are downloadable (.md / print
// -ready .html) and shareable via a tenant-scoped link.
export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles };
  const canReports = can(ctx, "reports:read");

  const [projects, people] = canReports
    ? await Promise.all([listProjects(ctx, {}), listWorkload(ctx)])
    : [[], []];

  return (
    <ReportsClient
      canReports={canReports}
      me={{ id: session.user.id, name: session.user.name ?? "You" }}
      tenantName={session.user.tenantName}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      people={people.map((p) => ({ id: p.userId, name: p.name, department: p.departmentName }))}
    />
  );
}
