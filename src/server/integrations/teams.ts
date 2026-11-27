import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, isHeadOfProjects } from "@/lib/rbac";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { appBaseUrl } from "@/server/assistant/lumi-config";
import { IntegrationError } from "@/server/integrations/youtrack";
import type { Rag } from "@/server/health";

/**
 * Configs › Integrations › Microsoft Teams: one channel webhook per tenant (a Teams
 * Workflows "post to a channel when a webhook request is received" URL, or a legacy
 * incoming webhook). When the Head approves the week's roll-up, its managerial summary is
 * posted there as an Adaptive Card; the Head can post it again from the rail.
 *
 * The webhook URL is a credential (anyone holding it can post), so it is stored encrypted
 * and never returned — only its host. It must be https on Microsoft's webhook hosts (no
 * redirects followed), so the server can't be pointed elsewhere. The card carries the
 * Head's summary, the status spread and a link — no PM names, no project lines.
 */

const PROVIDER = "teams";
const TIMEOUT_MS = 15_000;
const ALLOWED_HOSTS = [/\.webhook\.office\.com$/i, /\.logic\.azure\.com$/i, /\.api\.powerplatform\.com$/i, /\.powerautomate\.com$/i];

export function isTeamsWebhookUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === "https:" && !u.username && !u.password && (u.port === "" || u.port === "443") && ALLOWED_HOSTS.some((h) => h.test(u.hostname));
}

export const TeamsConnectInput = z.object({
  webhookUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(isTeamsWebhookUrl, "Paste the channel's Teams webhook URL (https, from Teams Workflows or an incoming webhook)."),
  channel: z.string().trim().max(80).optional(),
});

export interface TeamsStatus {
  connected: boolean;
  host: string | null;
  channel: string | null;
  lastPostedAt: string | null;
  lastError: string | null;
}

function assertCanManage(ctx: TenantContext): void {
  if (!can(ctx, "integrations:manage")) throw new IntegrationError("Managing integrations needs integrations:manage.", "FORBIDDEN");
}

async function readRow(ctx: TenantContext) {
  return withTenant(ctx, (tx) => tx.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } } }));
}

/** Is a Teams channel connected? (Any signed-in reader of the rail may know — not the URL.) */
export async function teamsConnected(ctx: TenantContext): Promise<boolean> {
  return Boolean(await readRow(ctx).catch(() => null));
}

export async function getTeamsStatus(ctx: TenantContext): Promise<TeamsStatus> {
  assertCanManage(ctx);
  const row = await readRow(ctx);
  return {
    connected: Boolean(row),
    host: row?.baseUrl ?? null,
    channel: (row?.config as { channel?: string } | null)?.channel ?? null,
    lastPostedAt: row?.lastCheckedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
  };
}

/** POST a card to the webhook. Never follows a redirect; answers an error string or null. */
async function postCard(url: string, card: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }] }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? null : `Teams answered ${res.status}.`;
  } catch {
    return "Couldn't reach Teams.";
  }
}

const adaptive = (body: unknown[], actions: unknown[] = []) => ({ $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body, ...(actions.length ? { actions } : {}) });

/** Test the webhook with a short card, then save it (encrypted). */
export async function connectTeams(ctx: TenantContext, raw: z.input<typeof TeamsConnectInput>): Promise<TeamsStatus> {
  assertCanManage(ctx);
  const input = TeamsConnectInput.parse(raw);
  const err = await postCard(input.webhookUrl, adaptive([{ type: "TextBlock", text: "QUBIT is connected to this channel. The weekly portfolio summary will be posted here when the Head approves it.", wrap: true }]));
  if (err) throw new IntegrationError(`The test message didn't go through: ${err}`, "TEST_FAILED");
  const host = `https://${new URL(input.webhookUrl).hostname}`;
  await withTenant(ctx, async (tx) => {
    const data = { baseUrl: host, secret: encryptSecret(input.webhookUrl), tokenLast4: input.webhookUrl.slice(-4), status: "connected", lastCheckedAt: new Date(), lastError: null, config: { channel: input.channel || null } };
    await tx.tenantIntegration.upsert({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } }, create: { tenantId: ctx.tenantId, provider: PROVIDER, ...data }, update: data });
    await audit(tx, ctx, { action: "update", entityType: "tenant_integration", entityId: PROVIDER, after: { connected: true, host, channel: input.channel || null } });
  });
  return getTeamsStatus(ctx);
}

export async function disconnectTeams(ctx: TenantContext): Promise<TeamsStatus> {
  assertCanManage(ctx);
  await withTenant(ctx, async (tx) => {
    await tx.tenantIntegration.deleteMany({ where: { provider: PROVIDER } });
    await audit(tx, ctx, { action: "delete", entityType: "tenant_integration", entityId: PROVIDER });
  });
  return getTeamsStatus(ctx);
}

/** The roll-up card: the week, the status spread, the Head's summary and a link to QUBIT. */
export function rollupCard(input: { isoWeek: string; tenantName: string; narrative: string; rags: Rag[]; approvedBy: string | null; link: string }): Record<string, unknown> {
  const t = { green: input.rags.filter((r) => r === "Green").length, amber: input.rags.filter((r) => r === "Amber").length, red: input.rags.filter((r) => r === "Red").length };
  const week = input.isoWeek.split("-W")[1];
  return adaptive(
    [
      { type: "TextBlock", text: `${input.tenantName} portfolio · Week ${week}`, weight: "Bolder", size: "Large", wrap: true },
      { type: "TextBlock", text: `${input.rags.length} projects · ${t.green} on track · ${t.amber} at risk · ${t.red} off track`, isSubtle: true, spacing: "None", wrap: true },
      ...input.narrative
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ type: "TextBlock", text: l.slice(0, 600), wrap: true })),
      { type: "TextBlock", text: `Approved by ${input.approvedBy ?? "the Head"}`, isSubtle: true, size: "Small", wrap: true },
    ],
    [{ type: "Action.OpenUrl", title: "Open in QUBIT", url: input.link }],
  );
}

/**
 * Post the week's APPROVED roll-up to the tenant's Teams channel. Head only. Best-effort:
 * answers { posted, error } and records the outcome on the integration; never throws for a
 * Teams failure, so an approval never fails because Teams did.
 */
export async function postRollupToTeams(ctx: TenantContext, isoWeek: string, tenantName: string): Promise<{ posted: boolean; error: string | null }> {
  if (!isHeadOfProjects(ctx)) throw new IntegrationError("Only the Head posts the roll-up.", "FORBIDDEN");
  const row = await readRow(ctx);
  if (!row) return { posted: false, error: "Teams isn't connected." };
  const report = await withTenant(ctx, (tx) =>
    tx.portfolioReport.findUnique({ where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } }, select: { id: true, status: true, narrative: true, payload: true, approvedBy: { select: { name: true } } } }),
  );
  if (!report || report.status !== "Approved" || !report.narrative) return { posted: false, error: "That week's roll-up isn't approved yet." };
  const rows = (report.payload as unknown as { rag: Rag }[] | null) ?? [];
  const card = rollupCard({ isoWeek, tenantName, narrative: report.narrative, rags: rows.map((r) => r.rag), approvedBy: report.approvedBy?.name ?? null, link: `${appBaseUrl()}/reports?week=${encodeURIComponent(isoWeek)}` });
  const error = await postCard(decryptSecret(row.secret), card);
  await withTenant(ctx, async (tx) => {
    await tx.tenantIntegration.update({ where: { id: row.id }, data: error ? { status: "error", lastError: error } : { status: "connected", lastError: null, lastCheckedAt: new Date() } });
    await audit(tx, ctx, { action: "update", entityType: "portfolio_report", entityId: report.id, after: { teams: error ? "failed" : "posted", isoWeek } });
  });
  return { posted: !error, error };
}
