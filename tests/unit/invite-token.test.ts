// M-O3 (docs/22 §3) — the token primitive. Pure: entropy, hashing, TTL.
import { describe, expect, it } from "vitest";
import { hashInviteToken, newInviteToken, INVITE_TTL_HOURS } from "@/lib/invite-token";

describe("newInviteToken", () => {
  it("mints a 256-bit base64url token", () => {
    const { raw } = newInviteToken();
    // 32 random bytes → 43 base64url chars, no padding, URL-safe alphabet only.
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats — the whole security argument rests on this", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newInviteToken().raw));
    expect(seen.size).toBe(500);
  });

  it("returns the hash of its own raw value, never the raw value for storage", () => {
    const { raw, hash } = newInviteToken();
    expect(hash).toBe(hashInviteToken(raw));
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(hash).not.toContain(raw);
  });

  it("expires 72 hours out by default", () => {
    const before = Date.now();
    const { expiresAt } = newInviteToken();
    const hours = (expiresAt.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(INVITE_TTL_HOURS - 0.01);
    expect(hours).toBeLessThan(INVITE_TTL_HOURS + 0.01);
  });

  it("honours a custom TTL", () => {
    const { expiresAt } = newInviteToken(1);
    expect((expiresAt.getTime() - Date.now()) / 3_600_000).toBeLessThan(1.01);
  });
});

describe("hashInviteToken", () => {
  it("is deterministic — the lookup key must be reproducible from the link", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
  });

  it("separates values that differ by one character", () => {
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
  });
});
