import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { getListStatuses } from "@/server/statuses";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/lists/{id}/statuses — resolved (inherited) statuses for the list.
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await getListStatuses(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
