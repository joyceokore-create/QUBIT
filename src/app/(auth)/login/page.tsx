import { LoginForm } from "./login-form";
import { loginErrorMessage, ssoEnabled } from "@/lib/sso";

// Sign in (design_handoff screen 0b). The form renders its own full-screen,
// brand-recolouring canvas, so this page just supplies the callback URL, whether
// Microsoft SSO is configured, and any error carried back from the OAuth callback.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  // Relative-only: a query value like https://evil.example must never become a
  // post-login redirect target.
  const safeCallbackUrl =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";
  return (
    <LoginForm
      callbackUrl={safeCallbackUrl}
      ssoEnabled={ssoEnabled()}
      ssoError={loginErrorMessage(error)}
    />
  );
}
