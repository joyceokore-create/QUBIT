// SSO detection (src/lib/sso.ts) — the one switch that flips the whole auth + invite
// flow between credentials (password onboarding) and Entra (Microsoft sign-in, no
// password). All three AZURE_AD_* vars must be present; any missing one = off. The
// suite strips these in vitest.config, so tests default to OFF unless they stub them on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ssoEnabled, entraIssuer } from "@/lib/sso";

describe("ssoEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off when the Azure vars are absent (the test default)", () => {
    expect(ssoEnabled()).toBe(false);
  });

  it("is on only when ALL THREE Azure vars are present", () => {
    vi.stubEnv("AZURE_AD_CLIENT_ID", "cid");
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "secret");
    vi.stubEnv("AZURE_AD_TENANT_ID", "tid");
    expect(ssoEnabled()).toBe(true);
  });

  it("stays off if any single var is missing", () => {
    vi.stubEnv("AZURE_AD_CLIENT_ID", "cid");
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "secret");
    // tenant id missing
    expect(ssoEnabled()).toBe(false);
  });

  it("pins the issuer to the org's own directory (never /common)", () => {
    vi.stubEnv("AZURE_AD_TENANT_ID", "tid-123");
    expect(entraIssuer()).toBe("https://login.microsoftonline.com/tid-123/v2.0");
    expect(entraIssuer()).not.toContain("/common");
  });
});
