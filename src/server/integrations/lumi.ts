import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { encryptSecret } from "@/lib/secret-box";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { IntegrationError } from "@/server/integrations/youtrack";
import {
  clearLumiTokenCache,
  deleteAutopilot,
  getAutopilot,
  LumiError,
  lumiConnection,
  lumiMe,
  normaliseBaseUrl,
  putAutopilot,
  refreshAutopilot,
  type LumiAutopilot,
  type LumiConnection,
} from "@/server/connectors/lumi";
import { assistantApiBaseUrl, lumiConfigUrl } from "@/server/assistant/lumi-config";
import { assistantProviderSetting } from "@/server/assistant/sessions";

/**
 * Configs › Integrations › Lumi (plans Phase 3 and 5): connect the tenant's Lumi credential
 * (tested with GET /v1/me before it's saved), and switch Lumi's autopilot on or off for
 * QUBIT's in-product assistant. integrations:manage, like YouTrack. The client secret is
 * stored encrypted and never returned; only its last four characters are shown.
 */

const PROVIDER = "lumi";

function assertCanManage(ctx: TenantContext): void {
  if (!can(ctx, "integrations:manage")) throw new IntegrationError("Managing integrations needs integrations:manage.", "FORBIDDEN");
}

export const LumiConnectInput = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Enter Lumi's API address.")
    .refine((u) => u.startsWith("https://"), "Lumi's API address must use https."),
  clientId: z.string().trim().regex(/^cred_[A-Za-z0-9_-]+$/, "A Lumi client ID starts with cred_."),
  clientSecret: z.string().trim().min(8, "Paste the client secret."),
});

export interface LumiStatus {
  connected: boolean;
  source: "tenant" | "env" | null;
  baseUrl: string | null;
  clientId: string | null;
  secretLast4: string | null;
  product: string | null;
  environment: string | null;
  uses: string[];
  lastError: string | null;
  /** Ask Q uses Lumi only when ASSISTANT_PROVIDER=lumi on the server. */
  assistantSetting: "lumi" | "local";
  /** Where Lumi will call QUBIT and read its configuration. */
  apiBaseUrl: string;
  configUrl: string;
}

export async function getLumiStatus(ctx: TenantContext): Promise<LumiStatus> {
  assertCanManage(ctx);
  const row = await withTenant(ctx, (tx) => tx.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } } }));
  const conn = await lumiConnection(ctx);
  const cfg = (row?.config as { clientId?: string; product?: string; environment?: string; uses?: string[] } | null) ?? null;
  return {
    connected: Boolean(conn),
    source: conn?.source ?? null,
    baseUrl: conn?.baseUrl ?? null,
    clientId: conn?.clientId ?? null,
    secretLast4: row?.tokenLast4 ?? null,
    product: cfg?.product ?? null,
    environment: cfg?.environment ?? null,
    uses: cfg?.uses ?? [],
    lastError: row?.lastError ?? null,
    assistantSetting: assistantProviderSetting(),
    apiBaseUrl: assistantApiBaseUrl(),
    configUrl: lumiConfigUrl(),
  };
}

export async function connectLumi(ctx: TenantContext, raw: z.input<typeof LumiConnectInput>): Promise<LumiStatus> {
  assertCanManage(ctx);
  const input = LumiConnectInput.parse(raw);
  const conn: LumiConnection = { baseUrl: normaliseBaseUrl(input.baseUrl), clientId: input.clientId, clientSecret: input.clientSecret, source: "tenant" };
  let me;
  try {
    me = await lumiMe(conn);
  } catch (e) {
    throw new IntegrationError(e instanceof LumiError ? `Lumi refused the credential (${e.code}).` : "Couldn't reach Lumi at that address.", "TEST_FAILED");
  }
  await withTenant(ctx, async (tx) => {
    const data = {
      baseUrl: conn.baseUrl,
      secret: encryptSecret(input.clientSecret),
      tokenLast4: input.clientSecret.slice(-4),
      connectedUser: me.credential_id,
      connectedName: me.product,
      status: "connected",
      lastCheckedAt: new Date(),
      lastError: null,
      config: { clientId: input.clientId, product: me.product, environment: me.environment, uses: me.uses },
    };
    await tx.tenantIntegration.upsert({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } }, create: { tenantId: ctx.tenantId, provider: PROVIDER, ...data }, update: data });
    await audit(tx, ctx, { action: "update", entityType: "tenant_integration", entityId: PROVIDER, after: { connected: true, baseUrl: conn.baseUrl, product: me.product, environment: me.environment } });
  });
  clearLumiTokenCache();
  return getLumiStatus(ctx);
}

export async function disconnectLumi(ctx: TenantContext): Promise<LumiStatus> {
  assertCanManage(ctx);
  await withTenant(ctx, async (tx) => {
    await tx.tenantIntegration.deleteMany({ where: { provider: PROVIDER } });
    await audit(tx, ctx, { action: "delete", entityType: "tenant_integration", entityId: PROVIDER });
  });
  clearLumiTokenCache();
  return getLumiStatus(ctx);
}

/** Autopilot for QUBIT's in-product assistant: state, on (with QUBIT's addresses), refresh, off. */
export async function lumiAutopilot(ctx: TenantContext, action: "status" | "on" | "refresh" | "off"): Promise<LumiAutopilot | { enabled: false }> {
  assertCanManage(ctx);
  const conn = await lumiConnection(ctx);
  if (!conn) throw new IntegrationError("Connect Lumi first.", "NOT_CONNECTED");
  try {
    const out =
      action === "on"
        ? await putAutopilot(conn, { api_base_url: assistantApiBaseUrl(), config_url: lumiConfigUrl() })
        : action === "refresh"
          ? await refreshAutopilot(conn)
          : action === "off"
            ? ((await deleteAutopilot(conn)), { enabled: false as const })
            : await getAutopilot(conn);
    if (action !== "status") {
      await withTenant(ctx, (tx) => audit(tx, ctx, { action: "update", entityType: "lumi_autopilot", entityId: PROVIDER, after: { action, enabled: out.enabled, status: "config" in out ? out.config?.status : undefined } }));
    }
    return out;
  } catch (e) {
    if (e instanceof LumiError) throw new IntegrationError(e.code === "autopilot_held" ? "A Lumi group admin is holding autopilot off." : `Lumi answered: ${e.message}`, "TEST_FAILED");
    throw e;
  }
}
