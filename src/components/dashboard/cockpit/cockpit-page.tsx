import type { TenantContext } from "@/lib/tenant";
import type { DashboardLevel } from "@/lib/dashboard-level";
import { allowedLevels } from "@/lib/dashboard-level";
import { getCockpitData, PERIOD_WEEKS } from "@/server/dashboard-cockpit";
import { listWorkload } from "@/server/resources";
import { getProjectSetup, type ProjectSetup } from "@/server/project-setup";
import { CockpitInteractive } from "./cockpit-interactive";
import { PmCockpit } from "./pm";
import { HeadCockpit } from "./head";
import { ExecCockpit } from "./exec";
import { UserCockpit } from "./user";

// Every level has a cockpit preset; Superadmin sees the Executive cockpit (platform
// admin lives under /admin, not on the dashboard) and can preview any level.
export const BUILT_LEVELS: DashboardLevel[] = ["superadmin", "exec", "head", "pm", "user"];

export async function CockpitPage({
  ctx,
  level,
  roles,
  viewerId,
  viewerName,
  scope,
  period,
}: {
  ctx: TenantContext;
  level: DashboardLevel;
  roles: readonly string[];
  viewerId: string;
  viewerName?: string;
  scope?: string;
  period?: string;
}) {
  const now = new Date();
  const activePeriod = period && PERIOD_WEEKS[period] ? period : "8w";
  const full = await getCockpitData(ctx, now, PERIOD_WEEKS[activePeriod]);
  const allowed = allowedLevels(roles).filter((l) => BUILT_LEVELS.includes(l));
  // PM's "My allocation" tile — the viewer's own workload from the existing staffing engine.
  const allocationPct =
    level === "pm"
      ? ((await listWorkload(ctx).catch(() => [])).find((w) => w.userId === viewerId)?.totalPct ?? null)
      : null;

  // Portfolio scope filter (server round-trip so tiles and lists stay consistent).
  const portfolios = [...new Set(full.projects.map((p) => p.portfolioName).filter((n): n is string => !!n))].sort();
  const activeScope = scope && portfolios.includes(scope) ? scope : "all";
  const projects = activeScope === "all" ? full.projects : full.projects.filter((p) => p.portfolioName === activeScope);
  const data = { ...full, projects, pms: full.pms.filter((pm) => projects.some((p) => p.pmId === pm.id)) };

  // The PM work queue is per person: set-up left to do and this week's update for the
  // projects the viewer runs (lead or Project Manager member), before anything else.
  const setups: Record<string, ProjectSetup> = {};
  if (level === "pm") {
    const owned = full.projects.filter((p) => p.pmIds.includes(viewerId) && !["Completed", "Cancelled"].includes(p.status)).slice(0, 20);
    await Promise.all(owned.map(async (p) => void (setups[p.id] = await getProjectSetup(ctx, p.id, now))));
  }

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[24px_24px_72px]">
      <CockpitInteractive level={level} allowed={allowed} projects={data.projects} portfolios={portfolios} scope={activeScope} period={activePeriod}>
        {level === "superadmin" || level === "exec" ? (
          <ExecCockpit data={data} />
        ) : level === "head" ? (
          <HeadCockpit data={data} />
        ) : level === "pm" ? (
          <PmCockpit data={data} viewerId={viewerId} viewerName={viewerName} allocationPct={allocationPct} now={now} allowPreviewAll={!roles.includes("ProjectManager")} setups={setups} />
        ) : (
          <UserCockpit data={data} viewerId={viewerId} />
        )}
      </CockpitInteractive>
    </main>
  );
}
