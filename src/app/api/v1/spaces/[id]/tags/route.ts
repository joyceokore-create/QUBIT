import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createTag, listTagsForSpace } from "@/server/tags";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const createTagSchema = z
  .object({ name: z.string().min(1).max(60), colorToken: z.string().min(1).max(64) })
  .strict();

// GET/POST /api/v1/spaces/{id}/tags
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listTagsForSpace(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = createTagSchema.parse(await readJson(req));
    return ok(await createTag(guard.ctx, id, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}
