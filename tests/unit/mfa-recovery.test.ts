// M-O4 (docs/23 §10) — recovery codes. Pure: format, hashing, matching, single use.
import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashRecoveryCode, matchRecoveryCode } from "@/lib/mfa-recovery";
import { mfaRequired } from "@/lib/mfa-policy";

describe("generateRecoveryCodes", () => {
  it("returns ten grouped codes by default", () => {
    const { plain } = generateRecoveryCodes();
    expect(plain).toHaveLength(10);
    for (const c of plain) expect(c).toMatch(/^[a-f0-9]{5}-[a-f0-9]{5}$/);
  });

  it("stores hashes, never the codes themselves", () => {
    const { plain, hashes } = generateRecoveryCodes(3);
    expect(hashes).toHaveLength(3);
    for (const h of hashes) expect(h).toMatch(/^[a-f0-9]{64}$/);
    // The decisive property: no plaintext code appears in what gets persisted.
    for (const c of plain) expect(hashes.join()).not.toContain(c);
  });

  it("does not repeat codes", () => {
    const { plain } = generateRecoveryCodes(20);
    expect(new Set(plain).size).toBe(20);
  });
});

describe("matchRecoveryCode", () => {
  it("finds the index of a valid code", () => {
    const { plain, hashes } = generateRecoveryCodes(5);
    expect(matchRecoveryCode(plain[2], hashes)).toBe(2);
  });

  it("tolerates the way people actually type codes off a screen", () => {
    const { plain, hashes } = generateRecoveryCodes(3);
    expect(matchRecoveryCode(`  ${plain[0].toUpperCase()} `, hashes)).toBe(0);
    expect(matchRecoveryCode(plain[1].replace("-", " - "), hashes)).toBe(1);
  });

  it("returns -1 for an unknown or empty code", () => {
    const { hashes } = generateRecoveryCodes(3);
    expect(matchRecoveryCode("aaaaa-bbbbb", hashes)).toBe(-1);
    expect(matchRecoveryCode("", hashes)).toBe(-1);
    expect(matchRecoveryCode("   ", hashes)).toBe(-1);
  });

  it("a consumed code no longer matches — single use, modelled by removal", () => {
    const { plain, hashes } = generateRecoveryCodes(4);
    const idx = matchRecoveryCode(plain[1], hashes);
    const remaining = hashes.filter((_, i) => i !== idx);
    expect(matchRecoveryCode(plain[1], remaining)).toBe(-1);
    expect(matchRecoveryCode(plain[2], remaining)).toBeGreaterThanOrEqual(0);
  });

  it("hashing is deterministic", () => {
    expect(hashRecoveryCode("abcde-12345")).toBe(hashRecoveryCode("ABCDE-12345"));
  });
});

describe("mfaRequired", () => {
  it("requires a second factor for tenant-wide roles", () => {
    for (const role of ["PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA", "Executive"]) {
      expect(mfaRequired([role]), role).toBe(true);
    }
  });

  it("leaves it optional for everyone else", () => {
    for (const role of ["ProjectManager", "Member"]) {
      expect(mfaRequired([role]), role).toBe(false);
    }
  });

  it("requires it when ANY held role requires it", () => {
    expect(mfaRequired(["Member", "Executive"])).toBe(true);
    expect(mfaRequired([])).toBe(false);
  });
});
