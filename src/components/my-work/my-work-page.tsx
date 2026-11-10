import type { TenantContext } from "@/lib/tenant";
import { getMyWork } from "@/server/my-work";
import { getDailyBrief } from "@/server/daily-brief";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { MyWorkHome } from "./my-work-home";

/** UX6 — Member home ("My work"), server side: one read for the list, one for the Brief. */
export async function MyWorkPage({ ctx }: { ctx: TenantContext }) {
  const now = new Date();
  const [work, { brief, timeZone }] = await Promise.all([getMyWork(ctx, now), getDailyBrief(ctx, "Member", [], now)]);
  return (
    <MyWorkHome
      work={work}
      nowIso={now.toISOString()}
      brief={<DailyBrief items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />}
    />
  );
}
