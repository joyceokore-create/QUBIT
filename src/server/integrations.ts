import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/secret-box";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/server/project-tasks";

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
  { provider: "youtrack", name: "YouTrack", monogram: "YT", description: "Issues mirrored onto this project's board, progress and reports.", feedsQ: "defect trends", resourceLabel: "project short name (e.g. RBC)" },
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
  /** Non-secret provider settings (M7-C: YouTrack base URL + field-map overrides). */
  config: unknown;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  syncIntervalMinutes: number;
}

const LIVE_PROVIDERS = new Set(["github", "github_actions", "youtrack"]);

export async function listIntegrations(ctx: TenantContext, projectId: string): Promise<IntegrationCard[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findMany({
      where: { projectId },
      select: {
        provider: true, connected: true, resource: true, secret: true,
        config: true, lastSyncAt: true, lastSyncError: true, syncIntervalMinutes: true,
      },
    }),
  );
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return PROVIDERS.map((p) => {
    const row = byProvider.get(p.provider);
    return {
      ...p,
      connected: row?.connected ?? false,
      resource: row?.resource ?? null,
      hasToken: Boolean(row?.secret),
      live: LIVE_PROVIDERS.has(p.provider),
      config: row?.config ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastSyncError: row?.lastSyncError ?? null,
      syncIntervalMinutes: row?.syncIntervalMinutes ?? 60,
    };
  });
}

/**
 * Field-map overrides (M7-C). Keys are the provider's own value names, which are free text
 * on a customised instance; VALUES are constrained to QUBIT's taxonomy so a typo in the
 * panel can never write an unknown status onto a board.
 */
const FieldMapInput = z
  .object({
    state: z.record(z.string().min(1), z.enum(TASK_STATUSES)).optional(),
    type: z.record(z.string().min(1), z.enum(TASK_TYPES)).optional(),
    priority: z.record(z.string().min(1), z.enum(TASK_PRIORITIES)).optional(),
  })
  .optional();

export const SetIntegrationInput = z.object({
  connected: z.boolean(),
  resource: z.string().nullable().optional(),
  /** Plaintext access token — encrypted before storage; omit to leave unchanged. */
  token: z.string().min(1).optional(),
  /** Non-secret settings. Never put a token in here — it is stored unencrypted. */
  config: z.object({ baseUrl: z.string().url(), fieldMap: FieldMapInput }).nullable().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
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
  // Omitting config leaves it alone; passing null clears it. Changing the connection
  // invalidates the sync watermark, so the next run re-reads the whole project rather than
  // trusting a timestamp taken against different settings.
  const config = input.config === undefined ? undefined : (input.config as Prisma.InputJsonValue | null);
  const resettingWatermark = config !== undefined || secret !== undefined || !input.connected;
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
        config: config ?? Prisma.DbNull,
        ...(input.syncIntervalMinutes ? { syncIntervalMinutes: input.syncIntervalMinutes } : {}),
      },
      update: {
        connected: input.connected,
        resource: input.resource ?? null,
        ...(secret === undefined ? {} : { secret }),
        ...(config === undefined ? {} : { config: config ?? Prisma.DbNull }),
        ...(input.syncIntervalMinutes ? { syncIntervalMinutes: input.syncIntervalMinutes } : {}),
        ...(resettingWatermark ? { lastSyncAt: null, lastSyncError: null } : {}),
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_integration",
      entityId: `${projectId}:${key}`,
      // Never audit the token or the config verbatim — the config is non-secret by policy,
      // but a mis-pasted token would end up in an immutable log.
      after: { connected: row.connected, hasToken: Boolean(row.secret), hasConfig: Boolean(row.config) },
    });
    return row;
  });
}
