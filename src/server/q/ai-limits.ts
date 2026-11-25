import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * A simple per-tenant daily cap on AI calls, counted from AiCallLog (calls that used the
 * model; fallbacks don't count). There were no AI limits before plan Phase 4; this is the
 * guard the summary (and later the Lumi extraction) checks before calling a model.
 * Q_AI_DAILY_CAP overrides the default.
 */
export const DEFAULT_AI_DAILY_CAP = 50;

export function aiDailyCap(): number {
  const n = Number(process.env.Q_AI_DAILY_CAP);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_AI_DAILY_CAP;
}

/** True when the tenant has used its AI calls for `purpose` today (UTC). */
export async function aiCapReached(ctx: TenantContext, purpose: string, now = new Date(), cap = aiDailyCap()): Promise<boolean> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const used = await withTenant(ctx, (tx) => tx.aiCallLog.count({ where: { purpose, usedAi: true, createdAt: { gte: start } } }));
  return used >= cap;
}
