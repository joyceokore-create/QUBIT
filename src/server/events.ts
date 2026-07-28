import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { notifyUsers } from "@/server/notifications";
import { emitEvent } from "@/server/realtime";

/**
 * Domain-event outbox (docs/16-revamp-plan.md §10). One write path, many reactions:
 * a mutation emits ONE event inside its own transaction, and the consumers fan out —
 *   1. a durable `domain_event` row (the fact itself; delta feed + digests read these),
 *   2. in-app Notification rows (recipients are computed by the domain code, which
 *      knows the approval gates and roles — see each call site),
 *   3. a realtime pg_notify for the SSE stream (fires only on commit, so the bell can
 *      never announce a rolled-back mutation).
 * Never create Notification rows directly from feature code — emit an event.
 */

export interface NotifyEntry {
  userId: string;
  kind: string;
  message: string;
  link?: string;
}

export interface DomainEventInput {
  /** Dot-namespaced past-tense fact, e.g. "task.assigned", "join_request.created". */
  type: string;
  entityType: string;
  entityId: string;
  /** Grounding data for later consumers (delta feed, digests). Never PII beyond ids/names. */
  payload?: Record<string, unknown>;
  /** In-app notification fan-out riding this event. */
  notify?: NotifyEntry[];
}

export async function emitDomainEvent(
  tx: Prisma.TransactionClient,
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  input: DomainEventInput,
): Promise<void> {
  const notify = input.notify ?? [];
  await tx.domainEvent.create({
    data: {
      tenantId: ctx.tenantId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: ctx.userId,
      payload: {
        ...(input.payload ?? {}),
        ...(notify.length ? { notified: notify.length } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  await notifyUsers(tx, ctx, notify);

  // Identifiers only over pg_notify (payload cap; never user content).
  await emitEvent(tx, {
    tenantId: ctx.tenantId,
    type: input.type,
    objectType: input.entityType,
    objectId: input.entityId,
    actorId: ctx.userId,
  });
  if (notify.length) {
    // Named SSE event the bell subscribes to (EventSource listens by event name).
    await emitEvent(tx, {
      tenantId: ctx.tenantId,
      type: "notification.created",
      objectType: "notification",
      objectId: input.entityId,
      actorId: ctx.userId,
      data: { userIds: notify.map((n) => n.userId) },
    });
  }
}
