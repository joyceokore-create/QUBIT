// The invite / set-password flow only exists when SSO is OFF. With SSO configured,
// createUser makes an ACTIVE account and mints no link — Microsoft is the only sign-in
// door (auth.ts authorize() refuses password login). The vitest worker inherits the
// AZURE_AD_* vars from .env (ssoEnabled() is true), so a suite that exercises the invite
// flow must pin SSO off: call disableSso() in beforeAll and restoreSso() in afterAll.

const KEYS = ["AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET", "AZURE_AD_TENANT_ID"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

export function disableSso(): void {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
}

export function restoreSso(): void {
  for (const k of KEYS) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
    delete saved[k];
  }
}
