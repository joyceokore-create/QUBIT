import { createHash, randomBytes } from "node:crypto";

/**
 * Invite / password-reset tokens (docs/22 §3).
 *
 * Two rules make the unauthenticated accept route safe:
 *  - **256 bits of entropy.** The token IS the capability — nobody presents a session
 *    when accepting an invite — so it must be unguessable and enumeration-safe.
 *  - **Only the hash is stored.** A leaked `invite_token` row cannot be replayed, the
 *    same reason password hashes exist. The raw value lives in the emailed link and in
 *    the mint call's return value, and nowhere else — never in the DB, never in audit.
 */

export const INVITE_TTL_HOURS = 72;

export interface MintedToken {
  /** Goes in the link. Never persisted. */
  raw: string;
  /** Persisted as `InviteToken.tokenHash`. */
  hash: string;
  expiresAt: Date;
}

export function newInviteToken(ttlHours = INVITE_TTL_HOURS): MintedToken {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    hash: hashInviteToken(raw),
    expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
  };
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
