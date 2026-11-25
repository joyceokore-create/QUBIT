import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { endLumiSession, LumiError, lumiConnection, startLumiSession, type LumiConnection } from "@/server/connectors/lumi";
import { mintDelegation, revokeAssistantSessions, DELEGATION_MAX_SECONDS } from "@/server/assistant/delegation";
import { lumiRolesFor } from "@/server/assistant/operations";

/**
 * Plan Phase 5 — the in-product assistant's sessions. When a person opens Ask Q and the
 * assistant is Lumi, QUBIT mints a delegation token (an assistant_session row) and starts a
 * Lumi session with it; the Lumi session token is stored encrypted on that row and used by
 * QUBIT's server for the person's runs — it never reaches the browser.
 *
 * A Lumi session can't outlive the delegation token (at most an hour), so near expiry the
 * next message simply opens a new pair; the person's conversations carry on.
 *
 * ASSISTANT_PROVIDER=lumi switches it on (default "local": today's Ask Q). Without a Lumi
 * connection, or while Lumi's autopilot is off or held, Ask Q falls back to "local".
 */

export type AssistantProvider = "lumi" | "local";

export function assistantProviderSetting(): AssistantProvider {
  return process.env.ASSISTANT_PROVIDER === "lumi" ? "lumi" : "local";
}

/** What Ask Q should use for this tenant right now. */
export async function assistantProvider(ctx: Pick<TenantContext, "tenantId" | "userId">): Promise<AssistantProvider> {
  if (assistantProviderSetting() !== "lumi") return "local";
  return (await lumiConnection(ctx)) ? "lumi" : "local";
}

export class AssistantUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AssistantUnavailableError";
  }
}

/** Lumi codes that mean "use Ask Q's local engine instead" rather than an error to show. */
const UNAVAILABLE = new Set(["autopilot_off", "autopilot_held", "config_not_ready", "pair_not_active", "product_disabled"]);

export interface OpenSession {
  conn: LumiConnection;
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
}

const REUSE_MARGIN_MS = 2 * 60_000;

/** The person's live assistant session, or a new one. */
export async function openAssistantSession(ctx: TenantContext & { name?: string }, opts: { fresh?: boolean } = {}, now = new Date()): Promise<OpenSession> {
  const conn = await lumiConnection(ctx);
  if (!conn) throw new AssistantUnavailableError("Lumi isn't connected.", "not_connected");
  if (!opts.fresh) {
    const live = await withTenant(ctx, (tx) =>
      tx.assistantSession.findFirst({
        where: { userId: ctx.userId, revokedAt: null, lumiSessionToken: { not: null }, expiresAt: { gt: new Date(now.getTime() + REUSE_MARGIN_MS) } },
        select: { id: true, lumiSessionToken: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      }),
    );
    if (live?.lumiSessionToken) return { conn, sessionId: live.id, sessionToken: decryptSecret(live.lumiSessionToken), expiresAt: live.expiresAt };
  }

  const delegation = await mintDelegation(ctx, DELEGATION_MAX_SECONDS, now);
  try {
    const s = await startLumiSession(conn, {
      user: { id: ctx.userId, roles: lumiRolesFor(ctx.roles), ...(ctx.name ? { display_name: ctx.name.slice(0, 200) } : {}) },
      delegation: { user_token: delegation.token, expires_at: delegation.expiresAt.toISOString() },
      ttl_seconds: DELEGATION_MAX_SECONDS,
    });
    const expiresAt = new Date(Math.min(delegation.expiresAt.getTime(), new Date(s.expires_at).getTime() || delegation.expiresAt.getTime()));
    await withTenant(ctx, (tx) => tx.assistantSession.update({ where: { id: delegation.sessionId }, data: { lumiSessionId: s.session_id, lumiSessionToken: encryptSecret(s.session_token), expiresAt } }));
    return { conn, sessionId: delegation.sessionId, sessionToken: s.session_token, expiresAt };
  } catch (e) {
    // The delegation token was never handed over: revoke it now.
    await revokeAssistantSessions(ctx, delegation.sessionId, now);
    if (e instanceof LumiError && UNAVAILABLE.has(e.code)) throw new AssistantUnavailableError("The assistant is off right now.", e.code);
    throw e;
  }
}

/** Sign-out or "end session": end the person's Lumi sessions (best effort) and revoke every
 * delegation token, so nothing Lumi holds still works. */
export async function endAssistantForUser(ctx: Pick<TenantContext, "tenantId" | "userId">, now = new Date()): Promise<number> {
  const live = await withTenant(ctx, (tx) => tx.assistantSession.findMany({ where: { userId: ctx.userId, revokedAt: null, lumiSessionId: { not: null } }, select: { lumiSessionId: true } }));
  if (live.length) {
    const conn = await lumiConnection(ctx).catch(() => null);
    if (conn) await Promise.all(live.map((s) => endLumiSession(conn, s.lumiSessionId!).catch(() => undefined)));
  }
  return revokeAssistantSessions(ctx, undefined, now);
}
