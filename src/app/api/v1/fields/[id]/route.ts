import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteFieldDefinition, updateFieldDefinition } from "@/server/fields";
import { updateFieldDefinition as updateSchema } from "@/server/schemas/fields";
import type { FieldConfig } from "@/server/fields/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateSchema.parse(await readJson(req));
    return ok(
      await updateFieldDefinition(guard.ctx, id, {
        ...patch,
        config: patch.config as FieldConfig | undefined,
      }),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteFieldDefinition(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
