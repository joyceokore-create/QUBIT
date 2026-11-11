import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { runsProjectWhere } from "@/lib/ownership";
import { isoWeekMonday, weekWindow } from "@/lib/iso-week";
import { effectiveRag } from "@/server/checkins";
import type { Rag } from "@/server/health";

/**
 * UX12 (D13) — Reports › History "past updates" for a PM: the confirmed weekly updates of the
 * projects they run (the one ownership rule), newest week first, under the tenant's RLS
 * context. Each week's status is read at that week's end, so a signed override still reads as
 * signed after its 7-day expiry (the reports-week rule).
 */
export interface PastUpdateRow {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  isoWeek: string;
  rag: Rag;
  narrative: string | null;
  sentAt: Date | null;
}

export async function listMyPastUpdates(ctx: TenantContext, take = 200): Promise<PastUpdateRow[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.checkIn.findMany({
      where: { status: "Confirmed", project: runsProjectWhere(ctx.userId) },
      select: {
        id: true,
        isoWeek: true,
        status: true,
        computedRag: true,
        ragOverride: true,
        overrideExpiresAt: true,
        narrative: true,
        submittedToHeadAt: true,
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ isoWeek: "desc" }, { createdAt: "desc" }],
      take,
    }),
  );
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project.id,
    projectName: r.project.name,
    projectCode: r.project.code,
    isoWeek: r.isoWeek,
    rag: effectiveRag(r, weekWindow(isoWeekMonday(r.isoWeek)).end),
    narrative: r.narrative,
    sentAt: r.submittedToHeadAt,
  }));
}
