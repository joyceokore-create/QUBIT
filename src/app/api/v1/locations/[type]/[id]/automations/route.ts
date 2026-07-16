import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse, UnprocessableError } from "@/server/errors";
import { createAutomation, listAutomations } from "@/server/automations";
import { createAutomation as createSchema } from "@/server/schemas/automations";
import { parseLocationType } from "@/server/schemas/fields";

type Ctx = { params: Promise<{ type: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { type, id } = await params;
    const locationType = parseLocationType(type);
    if (!locationType) throw new UnprocessableError("Invalid location type.");
    return ok(await listAutomations(guard.ctx, locationType, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { type, id } = await params;
    const locationType = parseLocationType(type);
    if (!locationType) throw new UnprocessableError("Invalid location type.");
    const input = createSchema.parse(await readJson(req));
    return ok(await createAutomation(guard.ctx, { ...input, locationType, locationId: id }));
  } catch (err) {
    return toErrorResponse(err);
  }
}
