import "server-only";
import crypto from "node:crypto";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { resolvePermissionsForRoles } from "@/server/role-permissions";

/**
 * Plan Phase 5 — the delegation token: how Lumi's in-product assistant calls QUBIT AS the
 * signed-in person. QUBIT mints it when the person opens the assistant panel and hands it to
 * Lumi with the session (Lumi keeps it sealed and sends it as a Bearer token on each tool
 * call). It is:
 *   - a compact HS256 JWT, audience "lumi", at most one hour long;
 *   - accepted ONLY on /api/assistant/v1/* (never on the app's cookie routes);
 *   - revocable: its `jti` is an assistant_session row, checked on every call;
 *   - never trusted for permissions: roles and permissions are re-read from the database on
 *     each call, so a role removed now is removed for the assistant now.
 * The secret is ASSISTANT_TOKEN_SECRET, or derived from AUTH_SECRET when that's unset.
 */

export const DELEGATION_AUDIENCE = "lumi";
export const DELEGATION_MAX_SECONDS = 3600;
const CLOCK_SKEW_SECONDS = 60;

function secret(): Buffer {
  const own = process.env.ASSISTANT_TOKEN_SECRET;
  if (own) return Buffer.from(own, "utf8");
  const auth = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!auth) throw new Error("ASSISTANT_TOKEN_SECRET (or AUTH_SECRET) is not set.");
  return Buffer.from(crypto.hkdfSync("sha256", auth, "qubit", "assistant-delegation-v1", 32));
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export interface DelegationClaims {
  sub: string;
  tid: string;
  jti: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Pure signing, exported for tests. */
export function signDelegation(claims: DelegationClaims): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}

/** The claims of a well-formed, correctly signed, current token for Lumi; null otherwise. */
export function verifyDelegation(token: string, now = new Date()): DelegationClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${head}.${body}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let header: { alg?: string };
  let claims: DelegationClaims;
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;
  const t = Math.floor(now.getTime() / 1000);
  if (claims.aud !== DELEGATION_AUDIENCE || typeof claims.sub !== "string" || typeof claims.tid !== "string" || typeof claims.jti !== "string") return null;
  if (typeof claims.exp !== "number" || claims.exp <= t - CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.iat !== "number" || claims.iat > t + CLOCK_SKEW_SECONDS || claims.exp - claims.iat > DELEGATION_MAX_SECONDS) return null;
  return claims;
}

/** Open an assistant session for this person and mint its delegation token. */
export async function mintDelegation(ctx: TenantContext, ttlSeconds = DELEGATION_MAX_SECONDS, now = new Date()): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const ttl = Math.max(60, Math.min(DELEGATION_MAX_SECONDS, Math.floor(ttlSeconds)));
  const iat = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((iat + ttl) * 1000);
  const row = await withTenant(ctx, async (tx) => {
    const created = await tx.assistantSession.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, expiresAt }, select: { id: true } });
    await audit(tx, ctx, { action: "create", entityType: "assistant_session", entityId: created.id, after: { expiresAt } });
    return created;
  });
  return { token: signDelegation({ sub: ctx.userId, tid: ctx.tenantId, jti: row.id, aud: DELEGATION_AUDIENCE, iat, exp: iat + ttl }), sessionId: row.id, expiresAt };
}

/** End one session (panel closed) or all of a person's (sign-out). Idempotent. */
export async function revokeAssistantSessions(ctx: Pick<TenantContext, "tenantId" | "userId">, sessionId?: string, now = new Date()): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const { count } = await tx.assistantSession.updateMany({ where: { userId: ctx.userId, revokedAt: null, ...(sessionId ? { id: sessionId } : {}) }, data: { revokedAt: now } });
    if (count) await audit(tx, ctx, { action: "update", entityType: "assistant_session", entityId: sessionId ?? ctx.userId, after: { revoked: count } });
    return count;
  });
}

export class AssistantAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AssistantAuthError";
  }
}

/**
 * The TenantContext for a call to /api/assistant/v1/*, from its Bearer token: signature,
 * audience and expiry checked; the session row must be live; the person must still be ACTIVE;
 * roles and permissions are read fresh. The context carries via: "lumi".
 */
export async function assistantContext(req: Request, now = new Date()): Promise<TenantContext> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) throw new AssistantAuthError("A delegation token is required.", 401);
  const claims = verifyDelegation(m[1]!, now);
  if (!claims) throw new AssistantAuthError("The delegation token isn't valid.", 401);
  const seed = { tenantId: claims.tid, userId: claims.sub };
  const loaded = await withTenant(seed, async (tx) => {
    const session = await tx.assistantSession.findFirst({ where: { id: claims.jti, userId: claims.sub, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
    if (!session) return null;
    const user = await tx.user.findUnique({ where: { id: claims.sub }, select: { status: true, roles: { select: { role: true } } } });
    if (!user || user.status !== "ACTIVE") return null;
    const roles = user.roles.map((r) => r.role);
    return { roles, permissions: await resolvePermissionsForRoles(tx, claims.tid, roles) };
  });
  if (!loaded) throw new AssistantAuthError("The assistant session has ended.", 401);
  return { tenantId: claims.tid, userId: claims.sub, roles: loaded.roles, permissions: loaded.permissions, via: "lumi" };
}
