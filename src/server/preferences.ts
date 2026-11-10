import "server-only";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/dates";
import { effectiveUiMode, type UiMode } from "@/lib/ui-mode";

/**
 * UX2 — two small settings the redesign reads everywhere (UX plan U5/Q3 and D11):
 *  - the tenant's time zone, so "today", "overdue" and due dates follow the tenant's clock;
 *  - the person's layout during the staged rollout (new home pages vs the classic cockpit).
 * Both run under the tenant's RLS context; the layout change is audited.
 */

/** The tenant's IANA zone, falling back to Africa/Nairobi if unset or unknown to Intl. */
export async function getTenantTimeZone(ctx: Pick<TenantContext, "tenantId" | "userId">): Promise<string> {
  const row = await withTenant(ctx, (tx) => tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { timeZone: true } }));
  return row?.timeZone && isValidTimeZone(row.timeZone) ? row.timeZone : DEFAULT_TIME_ZONE;
}

/** This person's effective layout: their stored choice, else the FEATURE_NEW_UI default. */
export async function getUiMode(ctx: Pick<TenantContext, "tenantId" | "userId">): Promise<UiMode> {
  const row = await withTenant(ctx, (tx) => tx.user.findUnique({ where: { id: ctx.userId }, select: { uiMode: true } }));
  return effectiveUiMode(row?.uiMode);
}

/** Store the person's own layout choice ("Back to classic dashboard" / "Use the new layout"). */
export async function setUiMode(ctx: Pick<TenantContext, "tenantId" | "userId">, mode: UiMode): Promise<UiMode> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.user.findUnique({ where: { id: ctx.userId }, select: { uiMode: true } });
    if (!before || before.uiMode === mode) return;
    // updateMany keyed on the caller's own id: a person can only ever change their own row,
    // and only a row RLS lets them see. Audit only what actually changed.
    const { count } = await tx.user.updateMany({ where: { id: ctx.userId }, data: { uiMode: mode } });
    if (count > 0) await audit(tx, ctx, { action: "update", entityType: "user", entityId: ctx.userId, before: { uiMode: before.uiMode }, after: { uiMode: mode } });
  });
  return mode;
}
