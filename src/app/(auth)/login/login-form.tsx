"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

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
  { label: "Riverbank super admin", email: "joyce.okore@riverbank.solutions", password: "Passw0rd!23", initial: "R", brand: "#c8151b" },
  { label: "KCB super admin", email: "daniel.kiptoo@kcb.example.invalid", password: "Passw0rd!23", initial: "K", brand: "#1b7a3e" },
];

const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-[var(--hair)] bg-[var(--wash)] px-[14px] py-3 text-[13.5px] text-[var(--qink)] outline-none transition-colors placeholder:text-[var(--ink5)] focus:border-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";

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
  const formStyle = { "--login-brand": loginBrand } as CSSProperties & { "--login-brand": string };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(420px,44%)_minmax(0,1fr)]" style={{ background: "var(--qbg)" }}>
      {/* Brand panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-[40px_44px] lg:flex"
        style={{ background: "linear-gradient(160deg,#0b2239 0%,#11402e 55%,color-mix(in oklab,#c8151b 75%,#0b2239) 130%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(700px 500px at 80% 110%, rgba(200,21,27,.35), transparent 65%), radial-gradient(600px 400px at -10% -10%, rgba(55,185,106,.18), transparent 60%)" }} />
        <div className="relative flex items-center gap-[11px]">
          <QubitLogo square={10} gap={3} radius={3} color="#37b96a" />
          <span className="font-heading text-[18px] font-bold tracking-[3px] text-white">QUBIT</span>
        </div>
        <div className="relative">
          <div className="mb-3.5 font-mono text-[10px] font-semibold tracking-[2.6px] text-white/55">ENTERPRISE PPM · WITH A COPILOT</div>
          <div className="max-w-[400px] font-heading text-[38px] font-extrabold leading-[1.1] tracking-[-1.4px] text-white">
            Every project, programme and portfolio. One command center.
          </div>
          <div className="mt-[22px] flex gap-[22px] font-mono text-[10px] tracking-[1.4px] text-white/60">
            <span>RBAC + MFA</span><span>FULL AUDIT TRAIL</span><span>TENANT-ISOLATED</span>
          </div>
        </div>
        <div className="relative font-mono text-[9.5px] tracking-[1.4px] text-white/45">TRUSTED ACROSS THE GROUP · KCB GROUP · RIVERBANK GROUP</div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-10" style={formStyle}>
        <ThemeToggle className="absolute right-[18px] top-[18px]" />

        <div className="w-[400px] max-w-full [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
          {/* Mobile wordmark (brand panel hidden < lg) */}
          <button type="button" onClick={() => router.push("/")} className="mb-6 flex items-center gap-[11px] lg:hidden">
            <QubitLogo square={10} gap={3} radius={3} color="var(--login-brand)" />
            <span className="font-heading text-[18px] font-bold tracking-[3px] text-[var(--qink)]">QUBIT</span>
          </button>

          <h1 className="mb-1.5 font-heading text-[26px] font-bold tracking-[-.7px] text-[var(--qink)]">Sign in</h1>
          <p className="mb-[22px] text-[13px] text-[var(--ink3)]">Your organization is resolved from your email — no picker.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5" noValidate>
            <input id="email" type="email" autoComplete="email" required placeholder="you@company.com" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />

            {resolved && (
              <div
                className="flex items-center gap-[9px] rounded-[11px] px-[13px] py-[9px] [animation:rise_.3s_ease_both]"
                aria-live="polite"
                style={{ background: "color-mix(in oklab, var(--login-brand) 8%, transparent)", border: "1px solid color-mix(in oklab, var(--login-brand) 30%, transparent)" }}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-[var(--login-brand)] text-[9.5px] font-extrabold text-[var(--onbrand)]">
                  {org.tenantName.charAt(0).toUpperCase()}
                </span>
                <span className="text-[12px] text-[var(--ink2)]">Signing in to <span className="font-bold text-[var(--login-brand)]">{org.tenantName}</span></span>
              </div>
            )}
            {org.status === "not-found" && (
              <p className="rounded-[11px] border border-[var(--hair)] bg-[var(--wash)] px-[13px] py-[9px] text-[12px] text-[var(--ink4)]" aria-live="polite">
                No organization found for that domain.
              </p>
            )}

            <input id="password" type="password" autoComplete="current-password" required placeholder="Password" className={INPUT_CLASS} value={password} onChange={(e) => setPassword(e.target.value)} />

            {showTotp ? (
              <input id="totpCode" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" className={INPUT_CLASS} value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
            ) : (
              <button type="button" onClick={() => setShowTotp(true)} className="self-start text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-[var(--login-brand)]">
                Enter authenticator code
              </button>
            )}

            {error && <p role="alert" className="text-[12px] text-[var(--bad)]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-[11px] px-[13px] py-[13px] text-[13.5px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-[2px] disabled:opacity-60"
              style={{ background: "var(--login-brand)", boxShadow: "0 4px 20px color-mix(in oklab, var(--login-brand) var(--glowA), transparent)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-[22px] mb-2.5 flex items-center gap-2.5">
            <span className="flex-1 border-b border-[var(--hair2)]" />
            <span className="font-mono text-[8.5px] tracking-[1.8px] text-[var(--ink5)]">DEMO QUICK SIGN-IN</span>
            <span className="flex-1 border-b border-[var(--hair2)]" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {QUICK_SIGN_INS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}
                className="flex flex-1 items-center gap-2 rounded-[11px] border border-[var(--hair)] bg-[var(--wash)] px-3 py-2.5 text-left text-[11.5px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--login-brand)]"
              >
                <span className="flex size-5 flex-none items-center justify-center rounded-full text-[9.5px] font-extrabold text-white" style={{ background: d.brand }}>{d.initial}</span>
                {d.label}
              </button>
            ))}
          </div>

          <div className="mt-4 text-[11px] leading-[1.5] text-[var(--ink5)]">
            You may be asked for a 6-digit authenticator code. Trouble signing in? Contact your administrator.
          </div>
        </div>
      </div>
    </div>
  );
}
