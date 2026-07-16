import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse, UnprocessableError } from "@/server/errors";
import { createView, listViews } from "@/server/views";
import { createView as createSchema } from "@/server/schemas/views";
import { parseLocationType } from "@/server/schemas/fields";

type Ctx = { params: Promise<{ type: string; id: string }> };

// GET/POST /api/v1/locations/{type}/{id}/views
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { type, id } = await params;
    const locationType = parseLocationType(type);
    if (!locationType) throw new UnprocessableError("Invalid location type.");
    return ok(await listViews(guard.ctx, locationType, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { type, id } = await params;
    const locationType = parseLocationType(type);
    if (!locationType) throw new UnprocessableError("Invalid location type.");
    const input = createSchema.parse(await readJson(req));
    return ok(await createView(guard.ctx, { ...input, locationType, locationId: id }));
  } catch (err) {
    return toErrorResponse(err);
  }
}
