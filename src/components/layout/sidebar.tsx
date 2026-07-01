import { AlertTriangle, Briefcase, LayoutGrid, Server, Shield, Target, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSidebarNavData } from "@/server/nav";
import { NavGroup } from "@/components/layout/nav-group";
import { NavItem } from "@/components/layout/nav-item";

// Portfolios have no icon field of their own — cycle a fixed set for visual variety,
// matching the reference dashboard's per-portfolio icons.
const PORTFOLIO_ICONS = [Briefcase, Shield, Server, Users];

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };

  const showPortfolios = can(ctx, "portfolio:read");
  const showProjects = can(ctx, "project:read");
  const showRisks = can(ctx, "risk:read");
  const nav = showPortfolios || showProjects || showRisks ? await getSidebarNavData(ctx) : null;

  return (
    <aside className="flex w-[216px] shrink-0 flex-col overflow-y-auto border-r border-ink-4 bg-white px-[10px] py-4">
      <NavGroup label="Navigation">
        <NavItem href="/dashboard" icon={LayoutGrid}>
          Group Overview
        </NavItem>
      </NavGroup>

      {showPortfolios && nav && nav.portfolios.length > 0 && (
        <NavGroup label="Portfolios">
          {nav.portfolios.map((portfolio, i) => (
            <NavItem
              key={portfolio.id}
              href={`/portfolios/${portfolio.id}`}
              icon={PORTFOLIO_ICONS[i % PORTFOLIO_ICONS.length]}
              count={portfolio.itemCount}
            >
              {portfolio.name}
            </NavItem>
          ))}
        </NavGroup>
      )}

      {showProjects && nav && (
        <NavGroup label="Standalone">
          <NavItem href="/standalone" icon={Target} count={nav.standaloneCount}>
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

      {showRisks && nav && (
        <div className="mt-auto border-t border-background pt-3.5">
          <NavItem href="/risks" icon={AlertTriangle} badge={nav.openRaidCount}>
            Risks &amp; Issues
          </NavItem>
        </div>
      )}
    </aside>
  );
}
