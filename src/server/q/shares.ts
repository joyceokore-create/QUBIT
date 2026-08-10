import { randomBytes } from "node:crypto";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import type { QReportType } from "@/server/q/report";

/**
 * Shareable report snapshots (MVP1 reports centre). A share stores the rendered Markdown at
 * publish time, so the link is stable and doesn't drift as underlying data changes. Every
 * share is tenant-scoped + RLS-enforced and audited; the URL uses a high-entropy token
 * (never the row id), and the share view lives inside the authenticated (app) area, so a
 * link only resolves for a signed-in colleague in the same tenant.
 */

export interface SharedReportView {
  token: string;
  type: string;
  title: string;
  periodLabel: string;
  markdown: string;
  usedAi: boolean;
  authorName: string | null;
  createdAt: Date;
}

export interface CreateShareInput {
  type: QReportType;
  targetId?: string;
  title: string;
  periodLabel: string;
  markdown: string;
  usedAi: boolean;
}

/** 32 bytes of entropy → 43-char base64url token. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createShare(
  ctx: TenantContext,
  input: CreateShareInput,
): Promise<{ token: string }> {
  const token = newToken();
  await withTenant(ctx, async (tx) => {
    const row = await tx.sharedReport.create({
      data: {
        tenantId: ctx.tenantId,
        token,
        type: input.type,
        targetId: input.targetId ?? null,
        title: input.title.slice(0, 200),
        periodLabel: input.periodLabel.slice(0, 120),
        markdown: input.markdown,
        usedAi: input.usedAi,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "shared_report",
      entityId: row.id,
      // Metadata only — never the report body.
      after: { type: input.type, targetId: input.targetId ?? null, title: input.title },
    });
  });
  return { token };
}

// DM1.73 (T7): SharedReport rows were write-only — reachable only via the emailed link.
// The reports index now lists recent ones, so a Friday report survives a lost email.
export interface ShareListRow {
  token: string;
  title: string;
  type: string;
  createdAt: Date;
}

/** Recent shared-report snapshots for the tenant, newest first (metadata only —
 * the body stays behind the token route). */
export async function listShares(ctx: TenantContext, take = 12): Promise<ShareListRow[]> {
  return withTenant(ctx, (tx) =>
    tx.sharedReport.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: { token: true, title: true, type: true, createdAt: true },
    }),
  );
}

export async function getShareByToken(
  ctx: TenantContext,
  token: string,
): Promise<SharedReportView | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.sharedReport.findFirst({
      where: { token },
      select: {
        token: true,
        type: true,
        title: true,
        periodLabel: true,
        markdown: true,
        usedAi: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });
    if (!row) return null;
    return {
      token: row.token,
      type: row.type,
      title: row.title,
      periodLabel: row.periodLabel,
      markdown: row.markdown,
      usedAi: row.usedAi,
      authorName: row.createdBy?.name ?? null,
      createdAt: row.createdAt,
    };
  });
}
