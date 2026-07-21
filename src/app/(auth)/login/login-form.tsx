"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandLogo } from "@/components/brand/brand-logo";
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
  { name: "Riverbank", email: "joyce.okore@riverbank.solutions", password: "Passw0rd!23", initial: "R", brand: "#c8151b" },
  { name: "KCB", email: "daniel.kiptoo@kcb.example.invalid", password: "Passw0rd!23", initial: "K", brand: "#1b7a3e" },
];

const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-white/10 bg-white/[0.05] px-[14px] py-2.5 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-[color-mix(in_oklab,var(--login-brand)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";

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
    <div
      className="relative min-h-screen w-full font-sans"
      style={{
        background: [
          "radial-gradient(ellipse 60% 50% at 15% 25%, rgba(11,34,57,0.85), transparent 60%)",
          "radial-gradient(ellipse 50% 50% at 85% 80%, color-mix(in oklab, var(--pbrand) 30%, transparent), transparent 65%)",
          "#050810",
        ].join(", "),
        // Login-only type: Lufga, matching the landing (loaded globally as
        // --font-lufga). Scoped to this wrapper via the font indirection vars.
        "--font-display": "var(--font-lufga)",
        "--font-body": "var(--font-lufga)",
      } as CSSProperties}
    >
      <ThemeToggle className="absolute right-[18px] top-[18px] z-20 text-white/70" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both] sm:p-6"
          style={{
            ...formStyle,
            boxShadow: [
              "0 30px 60px -20px rgba(0,0,0,0.65)",
              "0 0 0 1px rgba(255,255,255,0.02)",
              "0 20px 70px -30px color-mix(in oklab, var(--login-brand) 30%, transparent)",
            ].join(", "),
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mb-4 flex items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
          >
            <BrandLogo variant="night" className="h-7 w-auto" />
          </button>

          <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-white">Sign in</h1>
          <p className="mb-5 text-[13px] text-white/55">Your organization is resolved from your email — no picker.</p>

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
                <span className="text-[12px] text-white/80">Signing in to <span className="font-bold text-[var(--login-brand)]">{org.tenantName}</span></span>
              </div>
            )}
            {org.status === "not-found" && (
              <p className="rounded-[11px] border border-white/10 bg-white/[0.03] px-[13px] py-[9px] text-[12px] text-white/55" aria-live="polite">
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
                className="self-start rounded-sm text-[11.5px] font-semibold text-white/55 outline-none transition-colors hover:text-[var(--login-brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
              >
                Enter authenticator code
              </button>
            )}

            {error && <p role="alert" className="text-[12px] text-[#ff8a8a]">{error}</p>}

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
            <span className="flex-1 border-b border-white/10" />
            <span className="font-mono text-[8.5px] tracking-[1.8px] text-white/55">DEMO QUICK SIGN-IN</span>
            <span className="flex-1 border-b border-white/10" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {QUICK_SIGN_INS.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}
                className="flex flex-1 items-center gap-2.5 rounded-[11px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left outline-none transition-colors hover:border-[var(--login-brand)] focus-visible:border-[var(--login-brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
              >
                <span className="flex size-7 flex-none items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ background: d.brand }}>{d.initial}</span>
                <span className="truncate text-[13px] font-bold text-white/90">{d.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-3.5 text-[11px] leading-[1.5] text-white/60">
            You may be asked for a 6-digit authenticator code. Trouble signing in? Contact your administrator.
          </div>
        </div>
      </main>

      {/* Giant faded background wordmark (Lumi motif) — sits behind the card (z-0 vs main's z-10) and
          is clipped to the viewport so it never grows taller than the screen on short viewports. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 flex max-h-[38vh] justify-between overflow-hidden px-4 font-black uppercase leading-none text-white/[0.03]"
        style={{ fontSize: "clamp(40px, 11vw, 200px)" }}
      >
        {"QUBIT".split("").map((c, i) => (<span key={i}>{c}</span>))}
      </div>
    </div>
  );
}
