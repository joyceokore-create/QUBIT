import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveRequestedLevel } from "@/lib/dashboard-level";
import { CockpitPage } from "@/components/dashboard/cockpit/cockpit-page";
import { Forbidden } from "@/components/forbidden";

// The dashboard is the RBAC-level Delivery Cockpit (docs/17 rework). The level is resolved
// from the viewer's highest canonical role; a ?level= override (validated against what the
// viewer may preview — downward only) powers the in-cockpit level switcher. The persona
// preset assemblers (src/server/dashboard-*.ts) remain for reports/Q but no longer drive
// this page.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
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

  const { level: requestedLevel } = await searchParams;
  const level = resolveRequestedLevel(ctx.roles, requestedLevel);

  return <CockpitPage ctx={ctx} level={level} roles={ctx.roles} viewerId={ctx.userId} />;
}
