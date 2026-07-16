import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";

/** In-app notifications (workspace loop). */

export interface NotificationRow {
  id: string;
  kind: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

/** Fan out notifications inside an existing transaction (poster is excluded by caller). */
export async function notifyUsers(
  tx: Prisma.TransactionClient,
  ctx: Pick<TenantContext, "tenantId">,
  entries: { userId: string; kind: string; message: string; link?: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.notification.createMany({
    data: entries.map((e) => ({
      tenantId: ctx.tenantId,
      userId: e.userId,
      kind: e.kind,
      message: e.message,
      link: e.link ?? null,
    })),
  });
}

export async function listNotifications(ctx: TenantContext, limit = 20): Promise<NotificationRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      message: n.message,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt,
    }));
  });
}

export async function unreadCount(ctx: TenantContext): Promise<number> {
  return withTenant(ctx, (tx) => tx.notification.count({ where: { userId: ctx.userId, readAt: null } }));
}

export async function markRead(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx.notification.updateMany({ where: { id, userId: ctx.userId, readAt: null }, data: { readAt: new Date() } }),
  );
}

export async function markAllRead(ctx: TenantContext): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx.notification.updateMany({ where: { userId: ctx.userId, readAt: null }, data: { readAt: new Date() } }),
  );
}
