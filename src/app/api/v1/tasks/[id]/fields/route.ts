import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { getTaskFields } from "@/server/fields";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/{id}/fields — inherited field definitions + this task's values (computed filled in).
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await getTaskFields(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
