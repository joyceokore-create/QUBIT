import { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Milestone B — "Email me weekly": the viewer's own subscription to the Friday weekly
 * report (ReportSubscription, kind "weekly_report"; the Friday job notifies subscribers,
 * src/server/jobs/friday.ts). Always the caller's own row — never a body-supplied user.
 * Whether the notice becomes an EMAIL is the user's channel preference + the deployment's
 * FEATURE_EMAIL, which the route reports alongside.
 */

export const REPORT_SUBSCRIPTION_KIND = "weekly_report";

function key(ctx: TenantContext) {
  return { tenantId_userId_kind: { tenantId: ctx.tenantId, userId: ctx.userId, kind: REPORT_SUBSCRIPTION_KIND } };
}

export async function isSubscribed(ctx: TenantContext): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.reportSubscription.findUnique({ where: key(ctx), select: { id: true } });
    return row !== null;
  });
}

/** Idempotent: an existing subscription is left alone (no audit noise). */
export async function subscribe(ctx: TenantContext): Promise<{ subscribed: true; changed: boolean }> {
  return withTenant(ctx, async (tx) => {
    const existing = await tx.reportSubscription.findUnique({ where: key(ctx), select: { id: true } });
    if (existing) return { subscribed: true, changed: false };
    try {
      const row = await tx.reportSubscription.create({
        data: { tenantId: ctx.tenantId, userId: ctx.userId, kind: REPORT_SUBSCRIPTION_KIND },
        select: { id: true },
      });
      await audit(tx, ctx, { action: "create", entityType: "report_subscription", entityId: row.id, after: { kind: REPORT_SUBSCRIPTION_KIND } });
      return { subscribed: true, changed: true };
    } catch (e) {
      // Two clicks racing into the unique key: the first one won, which is what we wanted.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { subscribed: true, changed: false };
      throw e;
    }
  });
}

export async function unsubscribe(ctx: TenantContext): Promise<{ subscribed: false; changed: boolean }> {
  return withTenant(ctx, async (tx) => {
    const existing = await tx.reportSubscription.findUnique({ where: key(ctx), select: { id: true } });
    if (!existing) return { subscribed: false, changed: false };
    await tx.reportSubscription.delete({ where: { id: existing.id } });
    await audit(tx, ctx, { action: "delete", entityType: "report_subscription", entityId: existing.id, before: { kind: REPORT_SUBSCRIPTION_KIND } });
    return { subscribed: false, changed: true };
  });
}
