import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getBriefExtras } from "@/server/daily-brief";
import { getTenantTimeZone } from "@/server/preferences";
import { listGateQueue } from "@/server/gate-approval";
import { buildBrief } from "@/lib/daily-brief";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { HeadHealthHome } from "./head-health-home";

/**
 * UX8 — Head home ("Delivery health"), server side. One cockpit load (every project, RLS) and
 * one set of the Brief's role reads, shared by the Brief and the "Also waiting" panel, so the
 * two can't disagree. Counts the viewer may not act on stay null and are hidden.
 */
export async function HeadHealthPage({ ctx }: { ctx: TenantContext }) {
  const now = new Date();
  const cockpit = await getCockpitData(ctx, now);
  // WS1 — the gates waiting on this Head (approver lens: scope + four-eyes applied).
  const [timeZone, extras, gates] = await Promise.all([getTenantTimeZone(ctx), getBriefExtras(ctx, "HeadOfProjects", cockpit.projects, now), listGateQueue(ctx, "approver")]);
  const brief = buildBrief({ role: "HeadOfProjects", viewerId: ctx.userId, now, timeZone, projects: cockpit.projects, extras });
  return (
    <HeadHealthHome
      projects={cockpit.projects}
      gates={gates}
      pms={cockpit.pms.map((p) => ({ id: p.id, name: p.name }))}
      also={{ ideas: extras.ideasNew?.count ?? null, staffing: extras.staffingOpen?.count ?? null, clashes: extras.overbooked?.length ?? 0 }}
      timeZone={timeZone}
      nowIso={now.toISOString()}
      brief={<DailyBrief key="daily-brief" items={brief.items} generatedAt={formatTime(now, timeZone)} />}
    />
  );
}
