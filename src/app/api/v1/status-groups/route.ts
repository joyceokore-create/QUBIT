import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createStatusGroup } from "@/server/statuses";
import { createStatusGroup as createStatusGroupSchema } from "@/server/schemas/statuses";

// POST /api/v1/status-groups — create a status group (template or explicit statuses).
export async function POST(req: Request) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;
  try {
    const input = createStatusGroupSchema.parse(await readJson(req));
    return ok(await createStatusGroup(guard.ctx, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}
