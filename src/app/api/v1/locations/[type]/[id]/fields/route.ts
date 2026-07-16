import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse, UnprocessableError } from "@/server/errors";
import { createFieldDefinition, listFieldDefinitions } from "@/server/fields";
import { createFieldDefinition as createSchema, parseLocationType } from "@/server/schemas/fields";
import type { FieldConfig } from "@/server/fields/validate";

type Ctx = { params: Promise<{ type: string; id: string }> };

// GET/POST /api/v1/locations/{type}/{id}/fields — definitions at a space/folder/list.
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { type, id } = await params;
    const locationType = parseLocationType(type);
    if (!locationType) throw new UnprocessableError("Invalid location type.");
    return ok(await listFieldDefinitions(guard.ctx, locationType, id));
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
    return ok(
      await createFieldDefinition(guard.ctx, {
        locationType,
        locationId: id,
        name: input.name,
        type: input.type,
        config: input.config as FieldConfig | undefined,
        required: input.required,
      }),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
