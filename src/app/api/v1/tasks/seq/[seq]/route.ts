import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { getTaskBySeq } from "@/server/tasks";
import { UnprocessableError } from "@/server/errors";

type Ctx = { params: Promise<{ seq: string }> };

// GET /api/v1/tasks/seq/{n} — resolve a task by its human id (QBT-{n}).
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { seq } = await params;
    const n = Number(seq);
    if (!Number.isInteger(n) || n <= 0) throw new UnprocessableError("Invalid task number.");
    return ok(await getTaskBySeq(guard.ctx, n));
  } catch (err) {
    return toErrorResponse(err);
  }
}
