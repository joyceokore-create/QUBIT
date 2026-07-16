import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { stopTimer } from "@/server/time";
import { stopTimer as stopSchema } from "@/server/schemas/time";

// POST /api/v1/time/stop — stop the caller's running timer.
export async function POST(req: Request) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { entryId } = stopSchema.parse(await readJson(req));
    return ok(await stopTimer(guard.ctx, entryId));
  } catch (err) {
    return toErrorResponse(err);
  }
}
