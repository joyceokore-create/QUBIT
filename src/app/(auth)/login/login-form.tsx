"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { SSO_PROVIDER_ID } from "@/lib/sso";
import {
  AUTH_INPUT_CLASS,
  AUTH_LINK_CLASS,
  AUTH_PRIMARY_CLASS,
  AUTH_SECONDARY_CLASS,
  AuthField,
  AuthHeading,
  AuthShell,
  OrgChip,
} from "@/components/auth/auth-shell";

/** A synthetic demo identity for the quick sign-in (built server-side, non-production). */
export interface DemoAccount {
  name: string;
  email: string;
  password: string;
  initial: string;
  brand: string;
}

interface LoginFormProps {
  callbackUrl: string;
  /** All AZURE_AD_* env vars configured — resolved server-side, arrives as a plain boolean. */
  ssoEnabled?: boolean;
  /** Pre-mapped message for an ?error= carried back from the OAuth callback. */
  ssoError?: string | null;
  /** Empty in production. */
  demoAccounts?: DemoAccount[];
}

type OrgLookup =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; tenantName: string; tenantSlug: string }
  | { status: "not-found" };

/** UX plan D8c: one screen per step, each with its own illustration and line. */
type Step = "email" | "password" | "code";

// A domain needs at least one dot to be worth looking up — skips a request per keystroke.
function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-[15px] animate-spin rounded-full border-2 border-current/30 border-t-current" />;
}

export function LoginForm({ callbackUrl, ssoEnabled = false, ssoError = null, demoAccounts = [] }: LoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(ssoError);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [org, setOrg] = useState<OrgLookup>({ status: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!looksLikeCompleteDomain(email)) {
      setOrg({ status: "idle" });
      return;
    }
    setOrg({ status: "checking" });
    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/resolve-org?email=${encodeURIComponent(email)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setOrg({ status: "found", tenantName: data.tenantName, tenantSlug: data.tenantSlug });
        } else {
          setOrg({ status: "not-found" });
        }
      } catch {
        // Aborted or a network hiccup — this is a UX nicety, not the source of truth.
      }
    }, 400);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email]);

  // Move focus to the step's field so keyboard users land where they type next.
  useEffect(() => {
    focusRef.current?.focus();
  }, [step]);

  function goToPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!looksLikeCompleteDomain(email)) {
      setError("Enter your full work email, for example name@company.com.");
      return;
    }
    setStep("password");
  }

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, totpCode: totpCode || undefined, redirect: false });
    setLoading(false);
    if (!result || result.error) {
      // One generic message on purpose: never reveal whether the email, password or code
      // was the wrong part.
      setError(
        step === "code"
          ? "That didn't work. Check the code, or go back and check your password."
          : "Invalid email or password. If your account uses an authenticator app, enter its code.",
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  function handleMicrosoftSignIn() {
    setError(null);
    // The spinner stays on until the full-page redirect to Entra actually navigates away;
    // MFA (if the org requires it) happens there, and a completed Microsoft authentication
    // comes back as an active session.
    setSsoLoading(true);
    void signIn(SSO_PROVIDER_ID, { redirectTo: callbackUrl }).catch(() => setSsoLoading(false));
  }

  function applyDemo(d: DemoAccount) {
    setEmail(d.email);
    setPassword(d.password);
    setTotpCode("");
    setError(null);
    setStep("password");
  }

  const resolved = org.status === "found";
  const loginBrand = resolved && org.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";
  const orgName = resolved ? org.tenantName : null;

  const art =
    step === "code"
      ? { art: "mfa" as const, heading: orgName ? `Keep ${orgName}’s data safe` : "Keep your data safe", sentence: "A code from your authenticator app confirms it’s really you." }
      : step === "password"
        ? { art: "hero" as const, heading: "Know what needs you today", sentence: "Your home page opens on what needs your attention first, for your role." }
        : { art: "hero" as const, heading: "Run every project in one place", sentence: "Portfolios, projects, risks and weekly reporting, in one place." };

  const errorLine = error && (
    <p role="alert" className="text-[12.5px] text-[var(--l-err)]">
      {error}
    </p>
  );

  return (
    <AuthShell brand={loginBrand} footer={orgName ?? undefined} {...art}>
      {/* SSO configured → Microsoft is the ONLY sign-in method (unchanged behaviour). */}
      {ssoEnabled && (
        <>
          <AuthHeading title="Sign in to QUBIT" lead="Use your work Microsoft account to continue." />
          <button type="button" onClick={handleMicrosoftSignIn} disabled={ssoLoading} aria-busy={ssoLoading} className={AUTH_SECONDARY_CLASS}>
            {ssoLoading ? (
              <>
                <Spinner />
                Connecting to Microsoft…
              </>
            ) : (
              <>
                <MicrosoftMark />
                Sign in with Microsoft
              </>
            )}
          </button>
          {errorLine}
        </>
      )}

      {!ssoEnabled && step === "email" && (
        <form onSubmit={goToPassword} className="flex flex-col gap-4" noValidate>
          <AuthHeading title="Sign in to QUBIT" lead="Use your work email to continue." />
          <AuthField id="email" label="Work email" hint="Your email domain identifies your organisation.">
            <input
              ref={focusRef}
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              className={AUTH_INPUT_CLASS}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </AuthField>
          {org.status === "not-found" && (
            <p className="text-[12.5px] text-[var(--l-ink-3)]" aria-live="polite">
              No organisation uses that email domain.
            </p>
          )}
          {errorLine}
          <button type="submit" className={AUTH_PRIMARY_CLASS} disabled={org.status === "not-found"}>
            Continue
          </button>
          <div className="flex items-center justify-between text-[12.5px] text-[var(--l-ink-3)]">
            <span>New to QUBIT?</span>
            <Link href="/request-access" className={AUTH_LINK_CLASS}>
              Request access
            </Link>
          </div>
        </form>
      )}

      {!ssoEnabled && step === "password" && (
        <form onSubmit={submitCredentials} className="flex flex-col gap-4" noValidate>
          {orgName && <OrgChip name={orgName} />}
          <AuthHeading title="Welcome back" />
          <div className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--l-ink-3)]">
            <span className="truncate">{email}</span>
            <button type="button" className={AUTH_LINK_CLASS} onClick={() => { setStep("email"); setError(null); }}>
              Change
            </button>
          </div>
          <AuthField id="password" label="Password">
            <input
              ref={focusRef}
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              className={AUTH_INPUT_CLASS}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </AuthField>
          {errorLine}
          <button type="submit" disabled={loading} aria-busy={loading} className={AUTH_PRIMARY_CLASS}>
            {loading ? <><Spinner />Signing in…</> : "Sign in"}
          </button>
          <div className="flex items-center justify-between text-[12.5px] text-[var(--l-ink-3)]">
            <span>Use an authenticator app?</span>
            <button type="button" className={AUTH_LINK_CLASS} onClick={() => { setStep("code"); setError(null); }}>
              Enter your code
            </button>
          </div>
        </form>
      )}

      {!ssoEnabled && step === "code" && (
        <form onSubmit={submitCredentials} className="flex flex-col gap-4" noValidate>
          <AuthHeading title="Enter your code" lead="Open your authenticator app and enter the 6-digit code for QUBIT." />
          <AuthField id="totpCode" label="Authenticator code">
            <input
              ref={focusRef}
              id="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className={`${AUTH_INPUT_CLASS} h-12 text-center font-mono text-[20px] tracking-[.5em]`}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </AuthField>
          {errorLine}
          <button type="submit" disabled={loading || totpCode.length !== 6} aria-busy={loading} className={AUTH_PRIMARY_CLASS}>
            {loading ? <><Spinner />Verifying…</> : "Verify"}
          </button>
          <div className="flex items-center justify-between text-[12.5px] text-[var(--l-ink-3)]">
            <button type="button" className={AUTH_LINK_CLASS} onClick={() => { setStep("password"); setError(null); }}>
              Back
            </button>
            <span>Lost your device? Contact your administrator.</span>
          </div>
        </form>
      )}

      {!ssoEnabled && step === "email" && demoAccounts.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-[var(--l-hair)] pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--l-ink-3)]">Demo quick sign-in</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            {demoAccounts.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => applyDemo(d)}
                className="flex h-10 items-center gap-2.5 rounded-[10px] sm:flex-1 border border-[var(--l-field-bd)] px-3 text-left outline-none transition-colors hover:border-[var(--login-brand)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_35%,transparent)]"
              >
                <span className="flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: d.brand }}>
                  {d.initial}
                </span>
                <span className="truncate text-[13px] font-semibold text-[var(--l-ink)]">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
