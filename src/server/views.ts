import type { Prisma, LocationType, ViewType } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { NotFoundError } from "@/server/errors";

/**
 * Saved views (03-data-model.md §Views). A View persists a filter/sort/group/field
 * config for a location so teams share the same lens. Config is opaque JSON here;
 * the query compiler (views/query.ts) interprets the filter/sort parts.
 */

export async function listViews(ctx: TenantContext, locationType: LocationType, locationId: string) {
  return forTenant(ctx, (tx) =>
    tx.view.findMany({
      where: { locationType, locationId },
      orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
    }),
  );
}

export async function createView(
  ctx: TenantContext,
  input: {
    locationType: LocationType;
    locationId: string;
    type: ViewType;
    name: string;
    config?: Record<string, unknown>;
    isPinned?: boolean;
    isDefault?: boolean;
  },
) {
  return forTenant(ctx, async (tx) => {
    const view = await tx.view.create({
      data: {
        tenantId: ctx.tenantId,
        locationType: input.locationType,
        locationId: input.locationId,
        type: input.type,
        name: input.name,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        isPinned: input.isPinned ?? false,
        isDefault: input.isDefault ?? false,
        createdById: ctx.userId,
      },
    });
    await recordActivity(tx, ctx, {
      objectType: input.locationType.toLowerCase(),
      objectId: input.locationId,
      verb: "view.created",
      data: { name: view.name, type: view.type },
    });
    return view;
  });
}

export async function updateView(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; config: Record<string, unknown>; isPinned: boolean; isDefault: boolean; type: ViewType }>,
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.view.findUnique({ where: { id }, select: { id: true } }), "View not found.");
    return tx.view.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.isPinned !== undefined && { isPinned: patch.isPinned }),
        ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }),
        ...(patch.config !== undefined && { config: patch.config as Prisma.InputJsonValue }),
      },
    });
  });
}

export async function deleteView(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const view = await tx.view.findUnique({ where: { id }, select: { id: true } });
    if (!view) throw new NotFoundError("View not found.");
    await tx.view.delete({ where: { id } });
    return { id };
  });
}
