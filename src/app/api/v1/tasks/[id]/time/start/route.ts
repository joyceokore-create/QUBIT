import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { startTimer } from "@/server/time";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/tasks/{id}/time/start — 409 if a timer is already running.
export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await startTimer(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
