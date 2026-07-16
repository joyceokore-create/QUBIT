import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { getRunningTimer } from "@/server/time";

// GET /api/v1/time/running — the caller's running timer, or null.
export async function GET() {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    return ok(await getRunningTimer(guard.ctx));
  } catch (err) {
    return toErrorResponse(err);
  }
}
