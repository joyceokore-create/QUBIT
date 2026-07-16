import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { setFieldValue } from "@/server/fields";
import { setFieldValue as setValueSchema } from "@/server/schemas/fields";

type Ctx = { params: Promise<{ id: string; fieldId: string }> };

// PUT /api/v1/tasks/{id}/fields/{fieldId} — set/clear a custom field value (validated per type).
export async function PUT(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id, fieldId } = await params;
    const { value } = setValueSchema.parse(await readJson(req));
    return ok(await setFieldValue(guard.ctx, id, fieldId, value));
  } catch (err) {
    return toErrorResponse(err);
  }
}
