import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant } from "@/server/tenant-db";
import { emitEvent } from "@/server/realtime";

/**
 * Activity + realtime for every mutation (CLAUDE.md rule 6, 05-api-spec.md).
 * `recordActivity` writes the immutable Activity row AND emits the matching
 * realtime event in the same transaction — so a rolled-back mutation logs nothing
 * and clients never see a phantom event. Automations consume Activity, never poll.
 */

export interface ActivityInput {
  objectType: string; // "task" | "space" | "list" | ...
  objectId: string;
  verb: string; // "task.created", "task.status_changed", ...
  data?: Record<string, unknown>;
  /** Override the actor (defaults to the request user; null = system/automation/Q). */
  actorId?: string | null;
}

export async function recordActivity(
  tx: Prisma.TransactionClient,
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  input: ActivityInput,
): Promise<void> {
  const actorId = input.actorId === undefined ? ctx.userId : input.actorId;

  await tx.activity.create({
    data: {
      tenantId: ctx.tenantId,
      actorId,
      objectType: input.objectType,
      objectId: input.objectId,
      verb: input.verb,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
    },
  });

  await emitEvent(tx, {
    tenantId: ctx.tenantId,
    type: input.verb,
    objectType: input.objectType,
    objectId: input.objectId,
    actorId,
    data: input.data,
  });
}

/** Read an object's activity feed (newest first) — powers the task panel Activity tab. */
export async function listActivity(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  objectType: string,
  objectId: string,
  limit = 100,
) {
  return forTenant(ctx, (tx) =>
    tx.activity.findMany({
      where: { objectType, objectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
}
