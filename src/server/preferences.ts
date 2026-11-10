import "server-only";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/dates";
import { cache } from "react";
import { effectiveUiMode, type UiMode } from "@/lib/ui-mode";
import { landingViewRole, showViewSwitch, viewRoleOptions, type ViewRole } from "@/lib/view-roles";

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

export interface ViewState {
  uiMode: UiMode;
  /** The role whose home page and menu the person sees (D2a). */
  viewRole: ViewRole;
  /** Roles offered in "Viewing as" / "Preview home as…". */
  options: ViewRole[];
  showSwitch: boolean;
}

// cache() compares arguments by identity, so key it on strings: every caller builds its own
// ctx object, and an object key would never hit.
const readViewState = cache(async (tenantId: string, userId: string, rolesKey: string): Promise<ViewState> => {
  const roles = rolesKey ? rolesKey.split(",") : [];
  const row = await withTenant({ tenantId, userId }, (tx) => tx.user.findUnique({ where: { id: userId }, select: { uiMode: true, lastViewRole: true } }));
  return {
    uiMode: effectiveUiMode(row?.uiMode),
    viewRole: landingViewRole(roles, row?.lastViewRole),
    options: viewRoleOptions(roles),
    showSwitch: showViewSwitch(roles),
  };
});

/**
 * Everything the shell and the role-aware pages need about how this person sees QUBIT, in
 * one read — one query per request however many server components ask.
 */
export function getViewState(ctx: Pick<TenantContext, "tenantId" | "userId" | "roles">): Promise<ViewState> {
  return readViewState(ctx.tenantId, ctx.userId, [...ctx.roles].join(","));
}

export class ViewRoleError extends Error {
  code = "NOT_ALLOWED" as const;
}

/**
 * "Viewing as" switch (D2a). Only a role the person may view as is accepted — their own
 * business roles, or any role for Super Admin's preview — so the stored value can never
 * name something the menu wouldn't offer. Presentation only; audited as `view_switch`.
 */
export async function setViewRole(ctx: Pick<TenantContext, "tenantId" | "userId" | "roles">, role: ViewRole): Promise<ViewRole> {
  if (!viewRoleOptions(ctx.roles).includes(role)) throw new ViewRoleError(`Can't view QUBIT as ${role}.`);
  await withTenant(ctx, async (tx) => {
    const before = await tx.user.findUnique({ where: { id: ctx.userId }, select: { lastViewRole: true } });
    if (!before || before.lastViewRole === role) return;
    const { count } = await tx.user.updateMany({ where: { id: ctx.userId }, data: { lastViewRole: role } });
    if (count > 0) {
      await audit(tx, ctx, { action: "view_switch", entityType: "user", entityId: ctx.userId, before: { viewRole: before.lastViewRole }, after: { viewRole: role } });
    }
  });
  return role;
}
