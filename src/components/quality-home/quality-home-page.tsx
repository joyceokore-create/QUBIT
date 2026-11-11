import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getQualityOverview } from "@/server/quality";
import { getDailyBrief } from "@/server/daily-brief";
import { testersOverbooked } from "@/server/testers-this-week";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { QualityHome } from "./quality-home";

/** UX9 — Head of QA home ("Quality home"), server side: one cockpit load shared by the quality
 * read and the Brief. */
export async function QualityHomePage({ ctx }: { ctx: TenantContext }) {
  const now = new Date();
  const cockpit = await getCockpitData(ctx, now);
  const [quality, { brief, timeZone }, testers] = await Promise.all([
    getQualityOverview(ctx, cockpit.projects, now),
    getDailyBrief(ctx, "HeadOfQA", cockpit.projects, now),
    testersOverbooked(ctx, now).catch(() => []),
  ]);
  return (
    <QualityHome
      data={quality}
      testers={testers}
      nowIso={now.toISOString()}
      brief={<DailyBrief key="daily-brief" items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />}
    />
  );
}
