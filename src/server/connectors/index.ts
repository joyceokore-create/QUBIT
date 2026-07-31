import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptSecret } from "@/lib/secret-box";
import { fetchGithubSummary } from "@/server/connectors/github";
import { fetchYoutrackSummary } from "@/server/connectors/youtrack";
import { parseConfig } from "@/server/connectors/youtrack-sync";
import type { IntegrationSummary } from "@/server/connectors/types";

export type { IntegrationSummary };

/**
 * Connector dispatch. Given a connected ProjectIntegration (with an encrypted token), fetch
 * a live summary from the provider. GitHub and YouTrack are wired live; the others return
 * null until their connectors land — the seam is identical (decrypt token → provider call).
 */
async function runConnector(
  provider: string,
  token: string,
  resource: string,
  config: unknown,
): Promise<IntegrationSummary | null> {
  switch (provider) {
    case "github":
    case "github_actions":
      return fetchGithubSummary(token, resource);
    case "youtrack":
      return fetchYoutrackSummary(token, resource, parseConfig(config)?.baseUrl);
    default:
      return null; // teams | calendar | sentry — connectors pending
  }
}

/** Live summary for one connected integration (null if not connected / no token / error). */
export async function getIntegrationSummary(
  ctx: TenantContext,
  projectId: string,
  provider: string,
): Promise<IntegrationSummary | null> {
  const row = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findUnique({
      where: { projectId_provider: { projectId, provider } },
      select: { connected: true, resource: true, secret: true, config: true },
    }),
  );
  if (!row?.connected || !row.secret || !row.resource) return null;
  let token: string;
  try {
    token = decryptSecret(row.secret);
  } catch {
    return null;
  }
  return runConnector(provider, token, row.resource, row.config);
}

/** All connected integrations' summaries — used to ground Q's project report. */
export async function getConnectedSummaries(
  ctx: TenantContext,
  projectId: string,
): Promise<{ provider: string; summary: IntegrationSummary }[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findMany({
      where: { projectId, connected: true, secret: { not: null } },
      select: { provider: true, resource: true, secret: true, config: true },
    }),
  );
  const out: { provider: string; summary: IntegrationSummary }[] = [];
  await Promise.all(
    rows.map(async (r) => {
      if (!r.secret || !r.resource) return;
      let token: string;
      try {
        token = decryptSecret(r.secret);
      } catch {
        return;
      }
      const summary = await runConnector(r.provider, token, r.resource, r.config);
      if (summary) out.push({ provider: r.provider, summary });
    }),
  );
  return out;
}
