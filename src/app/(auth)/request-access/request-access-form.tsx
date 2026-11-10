"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AUTH_INPUT_CLASS, AUTH_LINK_CLASS, AUTH_PRIMARY_CLASS, AuthField, AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { accessRequestSchema } from "@/lib/access-request-schema";

function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

export function RequestAccessForm() {
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

  const shell = {
    brand: "var(--pbrand)",
    art: "hero" as const,
    heading: "Run every project in one place",
    sentence: "Portfolios, projects, risks and weekly reporting, in one place.",
  };

  if (done) {
    return (
      <AuthShell {...shell}>
        <AuthHeading
          title="Request received"
          lead={<>Thanks. We&apos;ll be in touch at <span className="font-semibold text-[var(--l-ink)]">{email}</span>.</>}
        />
        <Link href="/login" className={AUTH_LINK_CLASS}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell {...shell}>
      <AuthHeading title="Request access" lead="Tell us about your organisation and we&apos;ll reach out." />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <AuthField id="fullName" label="Full name">
          <input id="fullName" type="text" autoComplete="name" placeholder="Your first and last name" className={AUTH_INPUT_CLASS} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </AuthField>
        <AuthField id="email" label="Work email">
          <input id="email" type="email" autoComplete="email" placeholder="name@company.com" className={AUTH_INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />
          {knownOrg && (
            <p className="text-[12px] text-[var(--l-ink-3)]" aria-live="polite">
              {knownOrg} already uses QUBIT.{" "}
              <Link href="/login" className={AUTH_LINK_CLASS}>Sign in</Link> instead.
            </p>
          )}
        </AuthField>
        <AuthField id="company" label="Company name">
          <input id="company" type="text" autoComplete="organization" placeholder="For example: Northwind Ltd" className={AUTH_INPUT_CLASS} value={company} onChange={(e) => setCompany(e.target.value)} />
        </AuthField>
        <AuthField id="jobTitle" label="Job title (optional)">
          <input id="jobTitle" type="text" autoComplete="organization-title" placeholder="For example: Head of PMO" className={AUTH_INPUT_CLASS} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </AuthField>

        {/* Honeypot — visually hidden, never shown to real users. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="companyUrl">Website</label>
          <input id="companyUrl" type="text" tabIndex={-1} autoComplete="off" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-[12.5px] text-[var(--l-err)]">{error}</p>}

        <button type="submit" disabled={loading} aria-busy={loading} className={AUTH_PRIMARY_CLASS}>
          {loading ? "Sending…" : "Request access"}
        </button>
      </form>

      <div className="flex items-center justify-between text-[12.5px] text-[var(--l-ink-3)]">
        <span>Already have an account?</span>
        <Link href="/login" className={AUTH_LINK_CLASS}>Sign in</Link>
      </div>
    </AuthShell>
  );
}
