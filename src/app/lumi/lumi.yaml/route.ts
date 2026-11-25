import { buildLumiConfig, toYaml } from "@/server/assistant/lumi-config";

// GET /lumi/lumi.yaml — QUBIT's Lumi configuration (plan Phase 5): its URL is the config_url
// sent when autopilot is switched on. Public on purpose (Lumi fetches it); no secrets in it.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(`${toYaml(buildLumiConfig())}\n`, { headers: { "content-type": "application/yaml; charset=utf-8", "cache-control": "no-store" } });
}
