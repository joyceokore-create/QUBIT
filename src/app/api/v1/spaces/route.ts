import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createSpace } from "@/server/spaces";
import { createSpace as createSpaceSchema } from "@/server/schemas/hierarchy";

// POST /api/v1/spaces — create a space (with a default status group).
export async function POST(req: Request) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;
  try {
    const input = createSpaceSchema.parse(await readJson(req));
    const space = await createSpace(guard.ctx, input);
    return ok(space);
  } catch (err) {
    return toErrorResponse(err);
  }
}
