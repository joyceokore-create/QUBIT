import { buildOverview } from "@/server/assistant/lumi-config";

// GET /lumi/overview.md — what QUBIT is, in plain words, for Lumi (referenced by lumi.yaml).
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildOverview(), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
}
