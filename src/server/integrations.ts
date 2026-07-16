import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/secret-box";

/**
 * Per-project integrations — the workspace config surface. Providers are a fixed registry;
 * connect state + the linked resource persist per project. Live data sync (the "Feeds Q"
 * signals) is wired via real connectors in a later phase; this stores the connection.
 */

export interface ProviderDef {
  provider: string;
  name: string;
  monogram: string;
  description: string;
  feedsQ: string;
  resourceLabel: string;
}

export const PROVIDERS: ProviderDef[] = [
  { provider: "github", name: "GitHub", monogram: "GH", description: "Repo, PRs and reviews for this project only.", feedsQ: "PR ageing, merges", resourceLabel: "owner/repo" },
  { provider: "youtrack", name: "YouTrack", monogram: "YT", description: "Issue tracking synced to the board tab.", feedsQ: "defect trends", resourceLabel: "board id" },
  { provider: "teams", name: "Teams", monogram: "TM", description: "Project channel for messages and Q nudges.", feedsQ: "decisions, blockers", resourceLabel: "#channel" },
  { provider: "calendar", name: "Calendar", monogram: "CA", description: "Milestone and release calendar.", feedsQ: "deadlines", resourceLabel: "calendar id" },
  { provider: "github_actions", name: "GitHub Actions", monogram: "CI", description: "Build, test and security scan pipelines.", feedsQ: "build health", resourceLabel: "workflow" },
  { provider: "sentry", name: "Sentry", monogram: "SE", description: "Runtime errors from staging and prod.", feedsQ: "error spikes", resourceLabel: "project slug" },
];
const PROVIDER_KEYS = PROVIDERS.map((p) => p.provider) as [string, ...string[]];

export interface IntegrationCard extends ProviderDef {
  connected: boolean;
  resource: string | null;
  /** Whether a token is stored — never the token itself. */
  hasToken: boolean;
  /** true once a live connector exists for this provider. */
  live: boolean;
}

const LIVE_PROVIDERS = new Set(["github", "github_actions"]);

export async function listIntegrations(ctx: TenantContext, projectId: string): Promise<IntegrationCard[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findMany({
      where: { projectId },
      select: { provider: true, connected: true, resource: true, secret: true },
    }),
  );
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return PROVIDERS.map((p) => ({
    ...p,
    connected: byProvider.get(p.provider)?.connected ?? false,
    resource: byProvider.get(p.provider)?.resource ?? null,
    hasToken: Boolean(byProvider.get(p.provider)?.secret),
    live: LIVE_PROVIDERS.has(p.provider),
  }));
}

export const SetIntegrationInput = z.object({
  connected: z.boolean(),
  resource: z.string().nullable().optional(),
  /** Plaintext access token — encrypted before storage; omit to leave unchanged. */
  token: z.string().min(1).optional(),
});
export type SetIntegrationInput = z.infer<typeof SetIntegrationInput>;

export async function setIntegration(
  ctx: TenantContext,
  projectId: string,
  provider: string,
  input: SetIntegrationInput,
) {
  const key = z.enum(PROVIDER_KEYS).parse(provider);
  // Disconnect clears the stored token; connect with a token (re)stores it encrypted;
  // connect without a token leaves the existing one untouched.
  const secret = !input.connected ? null : input.token ? encryptSecret(input.token) : undefined;
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const row = await tx.projectIntegration.upsert({
      where: { projectId_provider: { projectId, provider: key } },
      create: {
        tenantId: ctx.tenantId,
        projectId,
        provider: key,
        connected: input.connected,
        resource: input.resource ?? null,
        secret: secret ?? null,
      },
      update: {
        connected: input.connected,
        resource: input.resource ?? null,
        ...(secret === undefined ? {} : { secret }),
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_integration",
      entityId: `${projectId}:${key}`,
      after: { connected: row.connected, hasToken: Boolean(row.secret) },
    });
    return row;
  });
}
