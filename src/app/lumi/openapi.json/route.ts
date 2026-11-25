import { buildOpenApi } from "@/server/assistant/lumi-config";

// GET /lumi/openapi.json — the assistant API's OpenAPI description, referenced by lumi.yaml.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildOpenApi(), { headers: { "cache-control": "no-store" } });
}
