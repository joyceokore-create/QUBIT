import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSidebarNavData } from "@/server/nav";
import { NavGroup } from "@/components/layout/nav-group";
import { NavItem, type NavIconName } from "@/components/layout/nav-item";

// Portfolios have no icon field of their own — cycle a fixed set for visual variety,
// matching the reference dashboard's per-portfolio icons.
const PORTFOLIO_ICON_NAMES: NavIconName[] = ["briefcase", "shield", "server", "users"];

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };

  const showDashboard = can(ctx, "dashboard:read");
  const showPortfolios = can(ctx, "portfolio:read");
  const showProjects = can(ctx, "project:read");
  const showRisks = can(ctx, "risk:read");
  const showAdmin = can(ctx, "iam:manage");
  const nav = showPortfolios || showProjects || showRisks ? await getSidebarNavData(ctx) : null;

  return (
    <aside className="flex w-[216px] shrink-0 flex-col overflow-y-auto border-r border-ink-4 bg-white px-[10px] py-4">
      {showDashboard && (
        <NavGroup label="Navigation">
          <NavItem href="/dashboard" icon="layout-grid">
            Group Overview
          </NavItem>
        </NavGroup>
      )}

      {showPortfolios && nav && nav.portfolios.length > 0 && (
        <NavGroup label="Portfolios">
          {nav.portfolios.map((portfolio, i) => (
            <NavItem
              key={portfolio.id}
              href={`/portfolios/${portfolio.id}`}
              icon={PORTFOLIO_ICON_NAMES[i % PORTFOLIO_ICON_NAMES.length]}
              count={portfolio.itemCount}
            >
              {portfolio.name}
            </NavItem>
          ))}
        </NavGroup>
      )}

      {showProjects && nav && (
        <NavGroup label="Standalone">
          <NavItem href="/standalone" icon="target" count={nav.standaloneCount}>
            Independent Items
          </NavItem>
        </NavGroup>
      )}

      {showProjects && nav && nav.orgUnits.length > 0 && (
        <NavGroup label="Subsidiaries">
          {nav.orgUnits.map((orgUnit) => (
            <NavItem key={orgUnit.id} href={`/subsidiaries/${orgUnit.id}`}>
              {orgUnit.flag ? `${orgUnit.flag} ` : ""}
              {orgUnit.name}
            </NavItem>
          ))}
        </NavGroup>
      )}

      {showAdmin && (
        <NavGroup label="Administration">
          <NavItem href="/admin/users" icon="users-round">
            Users
          </NavItem>
          <NavItem href="/admin/roles" icon="key-round">
            Roles
          </NavItem>
          <NavItem href="/admin/audit" icon="clipboard-list">
            Audit Log
          </NavItem>
        </NavGroup>
      )}

      {showRisks && nav && (
        <div className="mt-auto border-t border-background pt-3.5">
          <NavItem href="/risks" icon="alert-triangle" badge={nav.openRaidCount}>
            Risks &amp; Issues
          </NavItem>
        </div>
      )}
    </aside>
  );
}
