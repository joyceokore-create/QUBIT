import { LoginForm, type DemoAccount } from "./login-form";
import { sanitizeCallbackUrl } from "@/lib/callback-url";
import { loginErrorMessage, ssoEnabled } from "@/lib/sso";

// Sign in (UX plan D8c: two-panel). The page supplies the callback URL, whether Microsoft
// SSO is configured, any error carried back from the OAuth callback, and — outside
// production only — the demo quick sign-in accounts.

/** Seed password for the synthetic demo accounts (prisma/seed.ts DEMO_PASSWORD). */
const DEMO_PASSWORD = "Passw0rd!23";

/**
 * Demo quick sign-in, built on the server so neither the identities nor the seed password
 * reach a production bundle. Identities are synthetic (CLAUDE.md rule 3): the Demo Org B
 * admin is seeded; a Riverbank entry appears only when a local developer names an account
 * in DEMO_SIGNIN_RIVERBANK_EMAIL (e.g. user_001@riverbank.example.invalid).
 */
function demoAccounts(): DemoAccount[] {
  if (process.env.NODE_ENV === "production") return [];
  const accounts: DemoAccount[] = [];
  const riverbank = process.env.DEMO_SIGNIN_RIVERBANK_EMAIL?.trim();
  if (riverbank && riverbank.endsWith(".invalid")) {
    accounts.push({ name: "Riverbank", email: riverbank, password: DEMO_PASSWORD, initial: "R", brand: "#c8151b" });
  }
  accounts.push({ name: "Demo Org B", email: "demo.admin@demo-b.example.invalid", password: DEMO_PASSWORD, initial: "B", brand: "#1b7a3e" });
  return accounts;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl);
  return (
    <LoginForm
      callbackUrl={safeCallbackUrl}
      ssoEnabled={ssoEnabled()}
      ssoError={loginErrorMessage(error)}
      demoAccounts={demoAccounts()}
    />
  );
}
