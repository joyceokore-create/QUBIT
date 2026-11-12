import type { TenantContext } from "@/lib/tenant";
import { getDailyBrief } from "@/server/daily-brief";
import { getAdminHome } from "@/server/admin-home";
import { getTenantTimeZone } from "@/server/preferences";
import { parseArTab } from "@/lib/admin-home";
import { parsePage, parseSize } from "@/lib/list-state";
import { formatTime } from "@/lib/dates";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { AdminHome } from "./admin-home";

/** Rows per page on the Access requests list when the URL doesn't name one. */
const DEFAULT_SIZE = 10;

/**
 * UX11 — Super Admin home ("Admin home"), server side. The Brief needs no cockpit projects
 * (the Super Admin's lines are access, MFA and invites), so no estate load is made. The
 * Access requests list is server-paged: the URL's tab / page / size are validated here.
 */
export async function AdminHomePage({ ctx, params }: { ctx: TenantContext; params: { tab?: string; page?: string; size?: string } }) {
  const now = new Date();
  const tab = parseArTab(params.tab);
  const [{ brief, timeZone }, data] = await Promise.all([
    getDailyBrief(ctx, "PlatformSuperAdmin", [], now),
    getTenantTimeZone(ctx).then((tz) => getAdminHome(ctx, { tab, page: parsePage(params.page), size: parseSize(params.size, DEFAULT_SIZE), timeZone: tz }, now)),
  ]);
  return (
    <AdminHome
      data={data}
      nowIso={now.toISOString()}
      brief={<DailyBrief key="daily-brief" items={brief.items} generatedAt={formatTime(brief.generatedAt, timeZone)} />}
    />
  );
}
