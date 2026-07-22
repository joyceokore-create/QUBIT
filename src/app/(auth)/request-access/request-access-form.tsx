"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AuthShell } from "../auth-shell";
import { accessRequestSchema } from "@/lib/access-request-schema";

const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-[var(--l-field-bd)] bg-[var(--l-field-bg)] px-[14px] py-2.5 text-[13.5px] text-[var(--l-ink)] outline-none transition-colors placeholder:text-[var(--l-ph)] focus:border-[color-mix(in_oklab,var(--login-brand)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";
const LABEL_CLASS = "mb-1 block text-[12px] font-semibold text-[var(--l-ink-2)]";

function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

export function RequestAccessForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyUrl, setCompanyUrl] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [knownOrg, setKnownOrg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reuse the login org-resolver: if the work-email domain is already a QUBIT tenant, nudge
  // the visitor to sign in rather than request access.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!looksLikeCompleteDomain(email)) {
      setKnownOrg(null);
      return;
    }
    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/resolve-org?email=${encodeURIComponent(email)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setKnownOrg(data.tenantName ?? null);
        } else {
          setKnownOrg(null);
        }
      } catch {
        // resolver is a nicety, not a gate
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
    const parsed = accessRequestSchema.safeParse({ fullName, email, company, jobTitle, companyUrl });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setLoading(false);
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setLoading(false);
      setError("Network error. Please try again.");
    }
  }

  if (done) {
    return (
      <AuthShell brand="var(--pbrand)">
        <BrandLogo variant="color" className="mb-4 h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="mb-4 hidden h-7 w-auto dark:block" />
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Request received</h1>
        <p className="mb-5 text-[13px] leading-[1.6] text-[var(--l-ink-2)]">
          Thanks — we&apos;ll be in touch at <span className="font-bold text-[var(--l-ink)]">{email}</span>.
        </p>
        <Link href="/login" className="text-[12px] font-semibold text-[var(--login-brand)] hover:underline">
          ‹ Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell brand="var(--pbrand)">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 flex items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
      >
        <BrandLogo variant="color" className="h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="hidden h-7 w-auto dark:block" />
      </button>

      <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Request access</h1>
      <p className="mb-5 text-[13px] text-[var(--l-ink-2)]">Tell us about your organization and we&apos;ll reach out.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <div>
          <label htmlFor="fullName" className={LABEL_CLASS}>Full name</label>
          <input id="fullName" type="text" autoComplete="name" className={INPUT_CLASS} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>Work email</label>
          <input id="email" type="email" autoComplete="email" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />
          {knownOrg && (
            <p className="mt-1.5 text-[11.5px] text-[var(--l-ink-3)]" aria-live="polite">
              {knownOrg} already uses QUBIT —{" "}
              <Link href="/login" className="font-semibold text-[var(--login-brand)] hover:underline">sign in</Link> instead.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="company" className={LABEL_CLASS}>Company name</label>
          <input id="company" type="text" autoComplete="organization" className={INPUT_CLASS} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label htmlFor="jobTitle" className={LABEL_CLASS}>Job title <span className="font-normal text-[var(--l-ink-3)]">(optional)</span></label>
          <input id="jobTitle" type="text" autoComplete="organization-title" className={INPUT_CLASS} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>

        {/* Honeypot — visually hidden, never shown to real users. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="companyUrl">Website</label>
          <input id="companyUrl" type="text" tabIndex={-1} autoComplete="off" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-[12px] text-[var(--l-err)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-[11px] px-[13px] py-[11px] text-[13.5px] font-bold text-[var(--onbrand)] outline-none transition-transform hover:-translate-y-[2px] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--login-brand)] disabled:opacity-60"
          style={{ background: "var(--login-brand)", boxShadow: "0 4px 20px color-mix(in oklab, var(--login-brand) var(--glowA), transparent)" }}
        >
          {loading ? "Sending…" : "Request access"}
        </button>
      </form>

      <p className="mt-5 text-[12px] text-[var(--l-ink-3)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--login-brand)] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
