import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { deleteEntry } from "@/server/time";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/v1/time/{id}
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteEntry(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
