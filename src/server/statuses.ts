import type { Prisma, StatusType } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { resolveStatusGroupId } from "@/server/hierarchy";
import { ORDER_STEP } from "@/server/ordering";

/**
 * Status groups & statuses (04-module-specs §3). A StatusGroup is a reusable set
 * attached at the space level and inherited by its lists; renaming a status keeps
 * its id so tasks retain their status. colorToken values are semantic token keys.
 */

interface StatusSeed {
  name: string;
  colorToken: string;
  type: StatusType;
}

export const STATUS_TEMPLATES: Record<string, StatusSeed[]> = {
  simple: [
    { name: "To Do", colorToken: "info", type: "OPEN" },
    { name: "In Progress", colorToken: "brand", type: "ACTIVE" },
    { name: "Done", colorToken: "ok", type: "DONE" },
  ],
  kanban: [
    { name: "To Do", colorToken: "info", type: "OPEN" },
    { name: "In Progress", colorToken: "brand", type: "ACTIVE" },
    { name: "Review", colorToken: "warn", type: "ACTIVE" },
    { name: "Done", colorToken: "ok", type: "DONE" },
  ],
  scrum: [
    { name: "Backlog", colorToken: "neutral", type: "OPEN" },
    { name: "To Do", colorToken: "info", type: "OPEN" },
    { name: "In Progress", colorToken: "brand", type: "ACTIVE" },
    { name: "Review", colorToken: "warn", type: "ACTIVE" },
    { name: "Done", colorToken: "ok", type: "DONE" },
  ],
  // Mirrors the PPM → ClickUp status mapping (07-migration-guide.md).
  ppm: [
    { name: "Planning", colorToken: "info", type: "OPEN" },
    { name: "In Progress", colorToken: "brand", type: "ACTIVE" },
    { name: "At Risk", colorToken: "warn", type: "ACTIVE" },
    { name: "Blocked", colorToken: "bad", type: "ACTIVE" },
    { name: "Done", colorToken: "ok", type: "DONE" },
    { name: "Cancelled", colorToken: "neutral", type: "CLOSED" },
  ],
};

export type StatusTemplateKey = keyof typeof STATUS_TEMPLATES;

/**
 * Transaction-level StatusGroup creation — usable inside a larger mutation (e.g.
 * creating a space with its default statuses). Returns the group id.
 */
export async function createStatusGroupTx(
  tx: Prisma.TransactionClient,
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  input: { spaceId?: string | null; name: string; template?: StatusTemplateKey; statuses?: StatusSeed[] },
): Promise<string> {
  const seeds = input.statuses ?? STATUS_TEMPLATES[input.template ?? "simple"];
  const group = await tx.statusGroup.create({
    data: { tenantId: ctx.tenantId, spaceId: input.spaceId ?? null, name: input.name },
  });
  await tx.status.createMany({
    data: seeds.map((s, i) => ({
      tenantId: ctx.tenantId,
      statusGroupId: group.id,
      name: s.name,
      colorToken: s.colorToken,
      type: s.type,
      orderIndex: ORDER_STEP * (i + 1),
    })),
  });
  await recordActivity(tx, ctx, {
    objectType: "status_group",
    objectId: group.id,
    verb: "status_group.created",
    data: { name: group.name, count: seeds.length },
  });
  return group.id;
}

/** Create a StatusGroup (from a template or explicit statuses) owned by a space. */
export async function createStatusGroup(
  ctx: TenantContext,
  input: { spaceId?: string; name: string; template?: StatusTemplateKey; statuses?: StatusSeed[] },
) {
  return forTenant(ctx, async (tx) => {
    const id = await createStatusGroupTx(tx, ctx, input);
    return tx.statusGroup.findUniqueOrThrow({
      where: { id },
      include: { statuses: { orderBy: { orderIndex: "asc" } } },
    });
  });
}

/** Status group with its ordered statuses, or 404 if missing/cross-tenant. */
export async function getStatusGroup(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const group = await tx.statusGroup.findUnique({
      where: { id },
      include: { statuses: { orderBy: { orderIndex: "asc" } } },
    });
    return assertFound(group, "Status group not found.");
  });
}

/** All status groups for a space (its own + reusable/global groups). */
export async function listStatusGroupsForSpace(ctx: TenantContext, spaceId: string) {
  return forTenant(ctx, (tx) =>
    tx.statusGroup.findMany({
      where: { OR: [{ spaceId }, { spaceId: null }] },
      include: { statuses: { orderBy: { orderIndex: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  );
}

/** The ordered statuses that apply to a list (via inheritance). Powers the panel dropdown. */
export async function getListStatuses(ctx: TenantContext, listId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.list.findUnique({ where: { id: listId }, select: { id: true } }), "List not found.");
    const groupId = await resolveStatusGroupId(tx, listId);
    if (!groupId) return [];
    return tx.status.findMany({ where: { statusGroupId: groupId }, orderBy: { orderIndex: "asc" } });
  });
}
