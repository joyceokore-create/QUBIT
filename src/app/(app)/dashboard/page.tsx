import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DASHBOARD_LEVELS, resolveRequestedLevel } from "@/lib/dashboard-level";
import { VIEW_ROLE_LEVEL } from "@/lib/view-roles";
import { getViewState } from "@/server/preferences";
import { CockpitPage } from "@/components/dashboard/cockpit/cockpit-page";
import { Forbidden } from "@/components/forbidden";
import { MyWorkPage } from "@/components/my-work/my-work-page";
import { PmTodayPage } from "@/components/pm-today/pm-today-page";
import { HeadHealthPage } from "@/components/head-health/head-health-page";

// The dashboard is the RBAC-level Delivery Cockpit (docs/17 rework). The level is resolved
// from the viewer's highest canonical role; a ?level= override (validated against what the
// viewer may preview — downward only) powers the in-cockpit level switcher. The persona
// preset assemblers (src/server/dashboard-*.ts) remain for reports/Q but no longer drive
// this page.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; scope?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const { level: requestedLevel, scope, period } = await searchParams;
  // UX3 (D2a): in the new layout "Viewing as" picks the level. A ?level= deep link (the
  // product tour's PM walk) still works, validated downward-only as before; no button sets it.
  const view = await getViewState(ctx);
  const newUi = view.uiMode === "new";
  const deepLink = typeof requestedLevel === "string" && (DASHBOARD_LEVELS as readonly string[]).includes(requestedLevel);
  // UX6: Member's home is "My work" (tasks assigned to them), not a cockpit level.
  if (newUi && !deepLink && view.viewRole === "Member") return <MyWorkPage ctx={ctx} />;
  // UX7: the PM's home is "Today".
  if (newUi && !deepLink && view.viewRole === "ProjectManager") return <PmTodayPage ctx={ctx} />;
  // UX8: the Head's home is "Delivery health".
  if (newUi && !deepLink && view.viewRole === "HeadOfProjects") return <HeadHealthPage ctx={ctx} />;
  const level = newUi && !deepLink ? VIEW_ROLE_LEVEL[view.viewRole] : resolveRequestedLevel(ctx.roles, requestedLevel);

  return <CockpitPage ctx={ctx} level={level} roles={ctx.roles} viewerId={ctx.userId} viewerName={session.user.name ?? undefined} scope={scope} period={period} newUi={newUi} briefRole={newUi ? view.viewRole : undefined} />;
}
