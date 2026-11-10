import "server-only";
// UX8 — Approvals v1 (UX plan D5): the queue of decisions waiting for the viewer. It owns
// no data and no mutations — it reads the existing engines (ideas, staffing, the roll-up)
// and every decision goes back through their routes, which audit it. Each source is gated
// on the SAME rule its action enforces, so the page lists only what this person can act on.
import { can, isHeadOfProjects } from "@/lib/rbac";
import { isoWeekId } from "@/lib/iso-week";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { sortApprovals, type ApprovalItem, type ApprovalsFeed, type RollupSummary } from "@/lib/approvals";
import { canTriageIdeas, countOpenIdeas, listOpenIdeas } from "@/server/ideas";
import { countOpenResourceRequests, listResourceRequests } from "@/server/staffing";

const ACTIVE = { notIn: ["Completed", "Cancelled"] };

/**
 * Idea triage: the route gates on `idea:triage` and the engine asserts the Head role
 * (HeadOfProjects / PlatformSuperAdmin). Both must hold, or the Triage drawer would fail.
 */
export function canApproveIdeas(ctx: TenantContext): boolean {
  return can(ctx, "idea:triage") && canTriageIdeas(ctx);
}

/** Staffing: fill / decline are authorised in the engine on `staffing:manage`. */
export function canApproveStaffing(ctx: TenantContext): boolean {
  return can(ctx, "staffing:manage");
}

/** The roll-up: POST /api/rollup/approve gates on `reports:read`; approveRollup asserts the Head. */
export function canApproveRollup(ctx: TenantContext): boolean {
  return can(ctx, "reports:read") && isHeadOfProjects(ctx);
}

/** The /approvals page and its count route open for anyone who may decide either kind. */
export function canOpenApprovals(ctx: TenantContext): boolean {
  return can(ctx, "idea:triage") || can(ctx, "staffing:manage");
}

/** This ISO week's roll-up at a glance — the same numbers as Reports › This week's header. */
async function rollupSummary(ctx: TenantContext, now: Date): Promise<RollupSummary> {
  const isoWeek = isoWeekId(now);
  const [total, received, report] = await withTenant(ctx, (tx) =>
    Promise.all([
      tx.project.count({ where: { status: ACTIVE } }),
      tx.checkIn.count({ where: { isoWeek, status: "Confirmed", submittedToHeadAt: { not: null }, project: { status: ACTIVE } } }),
      tx.portfolioReport.findUnique({ where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } }, select: { status: true } }),
    ]),
  );
  return { isoWeek, received, total, approved: report?.status === "Approved" };
}

export async function getApprovals(ctx: TenantContext, now = new Date()): Promise<ApprovalsFeed> {
  const ideasOk = canApproveIdeas(ctx);
  const staffingOk = canApproveStaffing(ctx);
  const [ideas, requests, rollup] = await Promise.all([
    ideasOk ? listOpenIdeas(ctx) : Promise.resolve([]),
    staffingOk ? listResourceRequests(ctx, { openOnly: true }) : Promise.resolve([]),
    canApproveRollup(ctx) ? rollupSummary(ctx, now) : Promise.resolve(null),
  ]);
  const items: ApprovalItem[] = [
    ...ideas
      .filter((i): i is typeof i & { status: "New" | "Reviewing" } => i.status === "New" || i.status === "Reviewing")
      .map(
        (i): ApprovalItem => ({
          kind: "idea",
          id: i.id,
          title: i.title,
          createdAt: i.submittedAt.toISOString(),
          personName: i.submittedByName,
          status: i.status,
          sponsor: i.sponsor,
          problem: i.problem,
          expectedValue: i.expectedValue,
          suggestedPortfolioName: i.suggestedPortfolio?.name ?? null,
        }),
      ),
    ...requests
      .filter((r) => r.status === "Open")
      .map(
        (r): ApprovalItem => ({
          kind: "staffing",
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          personName: r.raisedByName,
          projectId: r.projectId,
          projectCode: r.projectCode,
          projectName: r.projectName,
          role: r.role,
          allocationPct: r.allocationPct,
          windowStart: r.windowStart.toISOString(),
          windowEnd: r.windowEnd.toISOString(),
          note: r.note,
        }),
      ),
  ];
  return { can: { ideas: ideasOk, staffing: staffingOk }, items: sortApprovals(items), rollup };
}

/** The sidebar badge: ideas + staffing waiting (the roll-up is counted in Reports, not here). */
export async function countApprovals(ctx: TenantContext): Promise<{ ideas: number; staffing: number; total: number }> {
  const [ideas, staffing] = await Promise.all([
    canApproveIdeas(ctx) ? countOpenIdeas(ctx) : Promise.resolve(0),
    canApproveStaffing(ctx) ? countOpenResourceRequests(ctx) : Promise.resolve(0),
  ]);
  return { ideas, staffing, total: ideas + staffing };
}
