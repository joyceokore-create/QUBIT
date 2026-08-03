"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AuthShell } from "../auth-shell";

interface LoginFormProps {
  callbackUrl: string;
}

type OrgLookup =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; tenantName: string; tenantSlug: string }
  | { status: "not-found" };

// A domain needs at least one dot to be worth looking up — skips a request per keystroke.
function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

// Demo quick sign-in — fills each tenant's super-admin email + demo password in one click
// (still requires pressing "Sign in"). Demo credentials only; remove before production.
const QUICK_SIGN_INS = [
  { name: "Riverbank", email: "joyce.okore@riverbank.solutions", password: "Passw0rd!23", initial: "R", brand: "#c8151b" },
];

const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-[var(--l-field-bd)] bg-[var(--l-field-bg)] px-[14px] py-2.5 text-[13.5px] text-[var(--l-ink)] outline-none transition-colors placeholder:text-[var(--l-ph)] focus:border-[color-mix(in_oklab,var(--login-brand)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState<OrgLookup>({ status: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, totpCode: totpCode || undefined, redirect: false });
    setLoading(false);
    if (!result || result.error) {
      setShowTotp(true);
      setError("Invalid email, password, or authentication code.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const resolved = org.status === "found";
  const loginBrand = resolved && org.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";

  return (
    <AuthShell brand={loginBrand}>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 flex items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
      >
        {/* Full-colour lockup (red icon + navy wordmark) on the light canvas;
            red icon + white wordmark on the dark one, so the mark stays legible. */}
        <BrandLogo variant="color" className="h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="hidden h-7 w-auto dark:block" />
      </button>

      <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Sign in</h1>
      <p className="mb-5 text-[13px] text-[var(--l-ink-2)]">Your organization is resolved from your email — no picker.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5" noValidate>
        <input id="email" type="email" autoComplete="email" required placeholder="you@company.com" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />

        {resolved && (
          <div
            className="flex items-center gap-[9px] rounded-[11px] px-[13px] py-[9px] [animation:rise_.3s_ease_both]"
            aria-live="polite"
            style={{ background: "color-mix(in oklab, var(--login-brand) 18%, transparent)", border: "1px solid color-mix(in oklab, var(--login-brand) 40%, transparent)" }}
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--login-brand)] text-[9.5px] font-extrabold text-[var(--onbrand)]">
              {org.tenantName.charAt(0).toUpperCase()}
            </span>
            <span className="text-[12px] text-[var(--l-ink-2)]">Signing in to <span className="font-bold text-[var(--login-brand)]">{org.tenantName}</span></span>
          </div>
        )}
        {org.status === "not-found" && (
          <p className="rounded-[11px] border border-[var(--l-hair)] bg-[var(--l-chip-bg)] px-[13px] py-[9px] text-[12px] text-[var(--l-ink-3)]" aria-live="polite">
            No organization found for that domain.
          </p>
        )}

        <input id="password" type="password" autoComplete="current-password" required placeholder="Password" className={INPUT_CLASS} value={password} onChange={(e) => setPassword(e.target.value)} />

        {showTotp ? (
          <input id="totpCode" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" className={INPUT_CLASS} value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowTotp(true)}
            className="self-start rounded-sm text-[11.5px] font-semibold text-[var(--l-ink-3)] outline-none transition-colors hover:text-[var(--login-brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
          >
            Enter authenticator code
          </button>
        )}

        {error && <p role="alert" className="text-[12px] text-[var(--l-err)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-[11px] px-[13px] py-[11px] text-[13.5px] font-bold text-[var(--onbrand)] outline-none transition-transform hover:-translate-y-[2px] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--login-brand)] disabled:opacity-60"
          style={{ background: "var(--login-brand)", boxShadow: "0 4px 20px color-mix(in oklab, var(--login-brand) var(--glowA), transparent)" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 mb-2.5 flex items-center gap-2.5">
        <span className="flex-1 border-b border-[var(--l-hair)]" />
        <span className="font-sans text-[9px] font-semibold uppercase tracking-[1.6px] text-[var(--l-ink-3)]">Demo quick sign-in</span>
        <span className="flex-1 border-b border-[var(--l-hair)]" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {QUICK_SIGN_INS.map((d) => (
          <button
            key={d.name}
            type="button"
            onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}
            className="flex flex-1 items-center gap-2.5 rounded-[11px] border border-[var(--l-field-bd)] bg-[var(--l-chip-bg)] px-3 py-2.5 text-left outline-none transition-colors hover:border-[var(--login-brand)] focus-visible:border-[var(--login-brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
          >
            <span className="flex size-7 flex-none items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ background: d.brand }}>{d.initial}</span>
            <span className="truncate text-[13px] font-bold text-[var(--l-ink)]">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3.5 text-[11px] leading-[1.5] text-[var(--l-ink-3)]">
        You may be asked for a 6-digit authenticator code. Trouble signing in? Contact your administrator.
      </div>
    </AuthShell>
  );
}
