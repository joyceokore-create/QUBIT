// Microsoft Entra ID SSO plumbing — env-only helpers, safe to import anywhere (no Prisma).
// The provider itself is wired in src/lib/auth.ts (Node runtime).

export const SSO_PROVIDER_ID = "microsoft-entra-id";

// String returns from the signIn callback become a redirect BEFORE any session is minted,
// which is how a rejected SSO sign-in lands back on our own login page instead of the
// unstyled Auth.js error page. Must stay a relative path (Auth.js only allows same-origin).
export const SSO_DENIED_REDIRECT = "/login?error=SsoAccessDenied";

/** All three AZURE_AD_* vars present — the only switch that activates the provider. */
export function ssoEnabled(): boolean {
  return Boolean(
    process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET &&
      process.env.AZURE_AD_TENANT_ID,
  );
}

/**
 * Pinned to the org's own directory. Omitting the issuer would fall back to
 * login.microsoftonline.com/common/ — which accepts ANY Microsoft account, personal
 * included. No trailing slash: the token's `iss` claim has none.
 */
export function entraIssuer(): string {
  return `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`;
}

/**
 * Map an ?error= code from the OAuth callback to display copy. One deliberately vague
 * message per outcome — never echo the raw query value, never reveal whether the account
 * exists, is suspended, or belongs to an unregistered domain.
 */
export function loginErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "SsoAccessDenied") {
    return "We couldn't sign you in with Microsoft. If you believe you should have access, contact your administrator.";
  }
  return "Sign-in failed. Please try again.";
}
