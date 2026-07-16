import { LoginForm } from "./login-form";

// Sign in (design_handoff screen 0b). The form renders its own full-screen,
// brand-recolouring canvas, so this page just supplies the callback URL.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />;
}
