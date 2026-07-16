import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { ConflictError } from "@/server/errors";

/**
 * Space-scoped tags (04-module-specs §2). Tags live on a Space and attach to tasks
 * via TaskTag; names are unique per space (@@unique([spaceId, name])).
 */

export async function listTagsForSpace(ctx: TenantContext, spaceId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.space.findUnique({ where: { id: spaceId }, select: { id: true } }), "Space not found.");
    return tx.tag.findMany({ where: { spaceId }, orderBy: { name: "asc" } });
  });
}

export async function createTag(
  ctx: TenantContext,
  spaceId: string,
  input: { name: string; colorToken: string },
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.space.findUnique({ where: { id: spaceId }, select: { id: true } }), "Space not found.");
    const existing = await tx.tag.findFirst({ where: { spaceId, name: input.name }, select: { id: true } });
    if (existing) throw new ConflictError("A tag with that name already exists in this space.");
    const tag = await tx.tag.create({
      data: { tenantId: ctx.tenantId, spaceId, name: input.name, colorToken: input.colorToken },
    });
    await recordActivity(tx, ctx, {
      objectType: "space",
      objectId: spaceId,
      verb: "tag.created",
      data: { name: tag.name },
    });
    return tag;
  });
}
