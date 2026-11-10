import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getPmToday } from "@/server/pm-today";
import { getDailyBrief } from "@/server/daily-brief";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { PmTodayHome } from "./pm-today-home";

/** UX7 — PM home ("Today"), server side: one cockpit load shared by the list and the Brief. */
export async function PmTodayPage({ ctx }: { ctx: TenantContext }) {
  const now = new Date();
  const cockpit = await getCockpitData(ctx, now);
  const [today, { brief, timeZone }] = await Promise.all([getPmToday(ctx, cockpit.projects, now), getDailyBrief(ctx, "ProjectManager", cockpit.projects, now)]);
  return <PmTodayHome today={today} nowIso={now.toISOString()} brief={<DailyBrief items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />} />;
}
