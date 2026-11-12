import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isPasswordReused,
  pushPasswordHistory,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/password";

describe("password policy", () => {
  it("rejects passwords under 12 characters (D-F8)", () => {
    expect(validatePasswordPolicy("Sh0rt!")).toMatch(/at least 12/);
    expect(validatePasswordPolicy("Elevenchar1")).toMatch(/at least 12/);
    expect(validatePasswordPolicy("Twelve-chars")).toBeNull();
  });

  it("accepts a 12+ character password", () => {
    expect(validatePasswordPolicy("Passw0rd!2026")).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    expect(await verifyPassword("Correct-Horse-1", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("password history / reuse", () => {
  it("flags a password matching one of the last 3 hashes", async () => {
    const history = [
      await hashPassword("OldPass1!"),
      await hashPassword("OldPass2!"),
      await hashPassword("OldPass3!"),
    ];
    expect(await isPasswordReused("OldPass2!", history)).toBe(true);
    expect(await isPasswordReused("BrandNewPass!", history)).toBe(false);
  });

  it("only checks the most recent HISTORY_SIZE hashes", async () => {
    const stale = await hashPassword("VeryOldPass!");
    const history = [
      stale,
      await hashPassword("OldPass1!"),
      await hashPassword("OldPass2!"),
      await hashPassword("OldPass3!"),
    ];
    // `stale` fell off the tracked window once a 4th password was pushed.
    expect(await isPasswordReused("VeryOldPass!", history)).toBe(false);
  });

  it("keeps history capped at 3 entries, dropping the oldest", () => {
    const history = pushPasswordHistory(["h1", "h2", "h3"], "h4");
    expect(history).toEqual(["h2", "h3", "h4"]);
  });
});
