import type { TenantContext } from "@/lib/tenant";
import { withTenant } from "@/lib/tenant";
import type { DashboardLevel } from "@/lib/dashboard-level";
import { allowedLevels } from "@/lib/dashboard-level";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { CockpitInteractive } from "./cockpit-interactive";
import { PmCockpit } from "./pm";
import { HeadCockpit } from "./head";
import { ExecCockpit } from "./exec";
import { UserCockpit } from "./user";
import { SuperadminCockpit, type AdminStats } from "./superadmin";

// Every level now has a cockpit preset.
export const BUILT_LEVELS: DashboardLevel[] = ["superadmin", "exec", "head", "pm", "user"];

async function adminStats(ctx: TenantContext): Promise<AdminStats> {
  return withTenant(ctx, async (tx) => {
    const [users, activeUsers, customRoles] = await Promise.all([
      tx.user.count(),
      tx.user.count({ where: { status: "ACTIVE" } }),
      tx.customRole.count({ where: { status: "Active" } }),
    ]);
    // app_module is a global table (no tenant scope) — count outside the tenant tx is fine,
    // but reuse this tx's client for one round-trip.
    const modules = await tx.appModule.count({ where: { status: "Active" } });
    return { users, activeUsers, customRoles, modules };
  });
}

export async function CockpitPage({
  ctx,
  level,
  roles,
  viewerId,
  scope,
}: {
  ctx: TenantContext;
  level: DashboardLevel;
  roles: readonly string[];
  viewerId: string;
  scope?: string;
}) {
  const now = new Date();
  const full = await getCockpitData(ctx, now);
  const allowed = allowedLevels(roles).filter((l) => BUILT_LEVELS.includes(l));
  const stats = level === "superadmin" ? await adminStats(ctx) : null;

  // Portfolio scope filter (server round-trip so tiles and lists stay consistent).
  const portfolios = [...new Set(full.projects.map((p) => p.portfolioName).filter((n): n is string => !!n))].sort();
  const activeScope = scope && portfolios.includes(scope) ? scope : "all";
  const projects = activeScope === "all" ? full.projects : full.projects.filter((p) => p.portfolioName === activeScope);
  const data = { ...full, projects, pms: full.pms.filter((pm) => projects.some((p) => p.pmId === pm.id)) };

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[24px_24px_72px]">
      <CockpitInteractive level={level} allowed={allowed} projects={data.projects} portfolios={portfolios} scope={activeScope}>
        {level === "superadmin" && stats ? (
          <SuperadminCockpit data={data} stats={stats} />
        ) : level === "exec" ? (
          <ExecCockpit data={data} />
        ) : level === "head" ? (
          <HeadCockpit data={data} />
        ) : level === "pm" ? (
          <PmCockpit data={data} viewerId={viewerId} now={now} />
        ) : (
          <UserCockpit data={data} viewerId={viewerId} />
        )}
      </CockpitInteractive>
    </main>
  );
}
