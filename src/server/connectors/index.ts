import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptSecret } from "@/lib/secret-box";
import { fetchGithubSummary } from "@/server/connectors/github";
import type { IntegrationSummary } from "@/server/connectors/types";

export type { IntegrationSummary };

/**
 * Connector dispatch. Given a connected ProjectIntegration (with an encrypted token), fetch
 * a live summary from the provider. Only GitHub is wired live today; the others return null
 * until their connectors land — the seam is identical (decrypt token → provider call).
 */
async function runConnector(
  provider: string,
  token: string,
  resource: string,
): Promise<IntegrationSummary | null> {
  switch (provider) {
    case "github":
    case "github_actions":
      return fetchGithubSummary(token, resource);
    default:
      return null; // youtrack | teams | calendar | sentry — connectors pending
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
      select: { connected: true, resource: true, secret: true },
    }),
  );
  if (!row?.connected || !row.secret || !row.resource) return null;
  let token: string;
  try {
    token = decryptSecret(row.secret);
  } catch {
    return null;
  }
  return runConnector(provider, token, row.resource);
}

/** All connected integrations' summaries — used to ground Q's project report. */
export async function getConnectedSummaries(
  ctx: TenantContext,
  projectId: string,
): Promise<{ provider: string; summary: IntegrationSummary }[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findMany({
      where: { projectId, connected: true, secret: { not: null } },
      select: { provider: true, resource: true, secret: true },
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
      const summary = await runConnector(r.provider, token, r.resource);
      if (summary) out.push({ provider: r.provider, summary });
    }),
  );
  return out;
}
