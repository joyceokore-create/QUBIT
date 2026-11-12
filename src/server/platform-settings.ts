import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { RetentionBodySchema } from "@/lib/retention-schema";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, retentionDays } from "@/lib/retention";

/**
 * UX fidelity D-F3b — platform-wide settings, stored in the system table `platform_setting`
 * (no tenant, no RLS — like access_request, which they govern). Only a PlatformSuperAdmin may
 * write one; every write is audited (before/after) in the actor's tenant, inside the same
 * transaction as the upsert.
 */
const RETENTION_KEY = "accessRequestRetentionDays";

export class PlatformSettingError extends Error {
  constructor(
    public code: "FORBIDDEN" | "VALIDATION",
    message: string,
  ) {
    super(message);
    this.name = "PlatformSettingError";
  }
}

export const RetentionInput = RetentionBodySchema;

/** Days decided access requests are kept (the default when never set). */
export async function getAccessRequestRetentionDays(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: RETENTION_KEY }, select: { value: true } });
  return retentionDays(row?.value);
}

export async function setAccessRequestRetentionDays(ctx: TenantContext, days: number): Promise<number> {
  if (!ctx.roles.includes("PlatformSuperAdmin")) {
    throw new PlatformSettingError("FORBIDDEN", "Only a Super Admin can change how long access requests are kept.");
  }
  const parsed = RetentionInput.safeParse({ days });
  if (!parsed.success) {
    throw new PlatformSettingError("VALIDATION", `Choose between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS} days.`);
  }
  const before = await getAccessRequestRetentionDays();
  await withTenant(ctx, async (tx) => {
    await tx.platformSetting.upsert({
      where: { key: RETENTION_KEY },
      create: { key: RETENTION_KEY, value: parsed.data.days, updatedById: ctx.userId },
      update: { value: parsed.data.days, updatedById: ctx.userId },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "platform_setting",
      entityId: RETENTION_KEY,
      before: { [RETENTION_KEY]: before },
      after: { [RETENTION_KEY]: parsed.data.days },
    });
  });
  return parsed.data.days;
}
