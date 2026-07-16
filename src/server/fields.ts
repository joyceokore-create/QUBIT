import type { Prisma, FieldType, LocationType } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { ORDER_STEP } from "@/server/ordering";
import { NotFoundError } from "@/server/errors";
import {
  validateFieldValue,
  validateFieldConfig,
  isComputedType,
  type FieldConfig,
} from "@/server/fields/validate";
import { assertValidFormula, evaluateFormula } from "@/server/fields/formula";

/**
 * Custom field definitions + values (04-module-specs §3). Definitions attach at a
 * SPACE/FOLDER/LIST and are inherited downward; values live per task, Zod-validated
 * per type. FORMULA/PROGRESS_AUTO are computed on read.
 */

// ── Definitions ──────────────────────────────────────────────────────────────

export async function createFieldDefinition(
  ctx: TenantContext,
  input: {
    locationType: LocationType;
    locationId: string;
    name: string;
    type: FieldType;
    config?: FieldConfig;
    required?: boolean;
  },
) {
  const config = input.config ?? {};
  validateFieldConfig(input.type, config);
  if (input.type === "FORMULA") assertValidFormula(config.formula ?? "");

  return forTenant(ctx, async (tx) => {
    const last = await tx.fieldDefinition.findFirst({
      where: { locationType: input.locationType, locationId: input.locationId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const def = await tx.fieldDefinition.create({
      data: {
        tenantId: ctx.tenantId,
        locationType: input.locationType,
        locationId: input.locationId,
        name: input.name,
        type: input.type,
        config: config as Prisma.InputJsonValue,
        required: input.required ?? false,
        orderIndex: (last?.orderIndex ?? 0) + ORDER_STEP,
      },
    });
    await recordActivity(tx, ctx, {
      objectType: input.locationType.toLowerCase(),
      objectId: input.locationId,
      verb: "field.created",
      data: { name: def.name, type: def.type },
    });
    return def;
  });
}

export async function updateFieldDefinition(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; config: FieldConfig; required: boolean }>,
) {
  return forTenant(ctx, async (tx) => {
    const def = await tx.fieldDefinition.findUnique({ where: { id }, select: { type: true } });
    if (!def) throw new NotFoundError("Field not found.");
    if (patch.config) {
      validateFieldConfig(def.type, patch.config);
      if (def.type === "FORMULA") assertValidFormula(patch.config.formula ?? "");
    }
    return tx.fieldDefinition.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.required !== undefined && { required: patch.required }),
        ...(patch.config !== undefined && { config: patch.config as Prisma.InputJsonValue }),
      },
    });
  });
}

export async function deleteFieldDefinition(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const def = await tx.fieldDefinition.findUnique({ where: { id }, select: { id: true } });
    if (!def) throw new NotFoundError("Field not found.");
    await tx.fieldDefinition.delete({ where: { id } });
    return { id };
  });
}

/** Definitions defined directly at a location (not inherited). */
export async function listFieldDefinitions(
  ctx: TenantContext,
  locationType: LocationType,
  locationId: string,
) {
  return forTenant(ctx, (tx) =>
    tx.fieldDefinition.findMany({
      where: { locationType, locationId },
      orderBy: { orderIndex: "asc" },
    }),
  );
}

// ── Inheritance + values ─────────────────────────────────────────────────────

type DefRow = {
  id: string;
  name: string;
  type: FieldType;
  config: unknown;
  required: boolean;
  orderIndex: number;
  locationType: LocationType;
};

/** Ordered (SPACE → FOLDER chain → LIST) field definitions that apply to a list. */
async function inheritedDefinitions(tx: Prisma.TransactionClient, listId: string): Promise<DefRow[]> {
  const list = await tx.list.findUnique({ where: { id: listId }, select: { spaceId: true, folderId: true } });
  if (!list) throw new NotFoundError("List not found.");

  // Build the location chain outermost → innermost for stable ordering.
  const chain: { type: LocationType; id: string; depth: number }[] = [
    { type: "SPACE", id: list.spaceId, depth: 0 },
  ];
  let folderId = list.folderId;
  const folderChain: string[] = [];
  while (folderId) {
    folderChain.unshift(folderId);
    const f: { parentId: string | null } | null = await tx.folder.findUnique({
      where: { id: folderId },
      select: { parentId: true },
    });
    folderId = f?.parentId ?? null;
  }
  folderChain.forEach((id, i) => chain.push({ type: "FOLDER", id, depth: 1 + i }));
  chain.push({ type: "LIST", id: listId, depth: 100 });

  const defs = await tx.fieldDefinition.findMany({
    where: { OR: chain.map((c) => ({ locationType: c.type, locationId: c.id })) },
    orderBy: { orderIndex: "asc" },
  });
  const depthOf = (type: LocationType, id: string) =>
    chain.find((c) => c.type === type && c.id === id)?.depth ?? 999;
  return defs
    .map((d) => ({ ...d, _depth: depthOf(d.locationType, d.locationId) }))
    .sort((a, b) => a._depth - b._depth || a.orderIndex - b.orderIndex);
}

export interface ResolvedField {
  id: string;
  name: string;
  type: FieldType;
  config: FieldConfig;
  required: boolean;
  value: unknown; // stored value, or computed for FORMULA/PROGRESS_AUTO
  computed: boolean;
}

/** Inherited field definitions for a task's list + this task's values, with computed types filled in. */
export async function getTaskFields(ctx: TenantContext, taskId: string): Promise<ResolvedField[]> {
  return forTenant(ctx, async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { listId: true } });
    if (!task) throw new NotFoundError("Task not found.");
    const [defs, values] = await Promise.all([
      inheritedDefinitions(tx, task.listId),
      tx.fieldValue.findMany({ where: { taskId }, select: { fieldId: true, value: true } }),
    ]);
    const valueByField = new Map(values.map((v) => [v.fieldId, v.value]));

    // Numeric var map for formulas: field name → number from its stored value.
    const vars: Record<string, number> = {};
    for (const d of defs) {
      const v = valueByField.get(d.id);
      if (typeof v === "number") vars[d.name] = v;
    }

    // Auto-progress from checklist completion (a common ClickUp source).
    let autoProgress: number | null = null;
    if (defs.some((d) => d.type === "PROGRESS_AUTO")) {
      const items = await tx.checklistItem.findMany({
        where: { checklist: { taskId } },
        select: { done: true },
      });
      autoProgress = items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0;
    }

    return defs.map((d) => {
      const config = (d.config ?? {}) as FieldConfig;
      let value = valueByField.get(d.id) ?? null;
      if (d.type === "FORMULA") value = evaluateFormula(config.formula ?? "", vars);
      else if (d.type === "PROGRESS_AUTO") value = autoProgress;
      else if (d.type === "AI") value = null; // computed lazily; deferred
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        config,
        required: d.required,
        value,
        computed: isComputedType(d.type),
      };
    });
  });
}

/** Set (or clear, with null) a task's value for a field. Validated per type. */
export async function setFieldValue(ctx: TenantContext, taskId: string, fieldId: string, value: unknown) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    const def = await tx.fieldDefinition.findUnique({ where: { id: fieldId }, select: { type: true, config: true, required: true } });
    if (!def) throw new NotFoundError("Field not found.");

    const normalized = validateFieldValue(def.type, (def.config ?? {}) as FieldConfig, value, def.required);

    if (normalized === null) {
      await tx.fieldValue.deleteMany({ where: { taskId, fieldId } });
    } else {
      await tx.fieldValue.upsert({
        where: { taskId_fieldId: { taskId, fieldId } },
        create: { tenantId: ctx.tenantId, taskId, fieldId, value: normalized as Prisma.InputJsonValue },
        update: { value: normalized as Prisma.InputJsonValue },
      });
    }
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "field.value_set", data: { fieldId } });
    return { taskId, fieldId, value: normalized };
  });
}
