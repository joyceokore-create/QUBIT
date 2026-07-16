import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { addManualEntry, listTaskEntries } from "@/server/time";
import { manualEntry } from "@/server/schemas/time";

type Ctx = { params: Promise<{ id: string }> };

// GET/POST /api/v1/tasks/{id}/time — entries + total; add a manual entry.
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listTaskEntries(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = manualEntry.parse(await readJson(req));
    return ok(await addManualEntry(guard.ctx, id, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}
