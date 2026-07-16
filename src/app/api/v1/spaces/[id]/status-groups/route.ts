import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { listStatusGroupsForSpace } from "@/server/statuses";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/spaces/{id}/status-groups — the space's own + reusable status groups.
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listStatusGroupsForSpace(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
