"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Guided first-login (docs/23 §6.2): password → MFA → confirm role → land.
 *
 * The gate is NOT lifted step by step. Each step writes its own fact server-side, and only
 * `/api/onboarding/finish` clears `mustChangePassword` — after re-checking the
 * prerequisites from the database. So closing the tab mid-flow leaves the user where they
 * were, and skipping a screen cannot skip a requirement.
 */

export interface OnboardingViewer {
  firstName: string;
  roleLabel: string;
  personaLabel: string;
  /** True for privileged roles — the MFA step then has no skip (docs/23 §6.1). */
  mfaRequired: boolean;
  /** Already enrolled (e.g. resuming): the MFA step is shown as satisfied. */
  mfaEnrolled: boolean;
}

type Step = "password" | "mfa" | "confirm";

export function OnboardingForm(props: { viewer: OnboardingViewer; needsPassword: boolean }) {
  return (
    <SessionProvider>
      <OnboardingFormInner {...props} />
    </SessionProvider>
  );
}

function StepDots({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "password", label: "Password" },
    { key: "mfa", label: "Two-factor" },
    { key: "confirm", label: "Confirm" },
  ];
  const index = steps.findIndex((s) => s.key === current);
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 flex-col gap-1">
          <span
            className="h-[3px] rounded-full transition-colors"
            style={{ background: i <= index ? "var(--brand)" : "var(--w10)" }}
          />
          <span className="text-[10px] font-medium" style={{ color: i <= index ? "var(--brand)" : "var(--ink5)" }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function OnboardingFormInner({ viewer, needsPassword }: { viewer: OnboardingViewer; needsPassword: boolean }) {
  const router = useRouter();
  const { update } = useSession();
  // Someone arriving from an M-O3 invite link already set a password; they resume at MFA.
  const [step, setStep] = useState<Step>(needsPassword ? "password" : "mfa");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Password step
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // MFA step
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [enrolled, setEnrolled] = useState(viewer.mfaEnrolled);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not set your password.");
      return;
    }
    setStep("mfa");
  }

  async function startEnrolment() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not start two-factor setup. Try again.");
      return;
    }
    // Only the QR comes back — the secret stays server-side (docs/23 §3).
    setQrDataUrl((await res.json()).qrDataUrl);
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Incorrect authentication code.");
      return;
    }
    setRecoveryCodes((await res.json()).recoveryCodes ?? []);
    setEnrolled(true);
  }

  async function finish() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/onboarding/finish", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not finish setting up.");
      return;
    }
    // DB-truth refresh (M-O1): the client asserts nothing; the callback re-reads the flag.
    await update({});
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <StepDots current={step} />

      {step === "password" && (
        <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ob-pw" className="text-[12.5px] font-medium text-[var(--ink2)]">New password</label>
            <Input id="ob-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <p className="text-[11px] text-[var(--ink4)]">At least 8 characters; don’t reuse a recent password.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ob-confirm" className="text-[12.5px] font-medium text-[var(--ink2)]">Confirm password</label>
            <Input id="ob-confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-[12.5px] text-status-red">{error}</p>}
          <Button type="submit" disabled={busy} className="mt-1">{busy ? "Saving…" : "Continue"}</Button>
        </form>
      )}

      {step === "mfa" && (
        <div className="mt-5 flex flex-col gap-3">
          {recoveryCodes ? (
            <>
              <p className="text-[13px] font-semibold text-[var(--qink)]">Save your recovery codes</p>
              <p className="text-[12px] leading-relaxed text-[var(--ink3)]">
                Each code signs you in once if you lose your phone. This is the only time they’re shown.
              </p>
              <div className="grid grid-cols-2 gap-1.5 rounded-[10px] border border-[var(--w08)] bg-[var(--wash2)] p-3">
                {recoveryCodes.map((c) => (
                  <code key={c} className="font-mono text-[12px] text-[var(--qink)]">{c}</code>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join("\n")).catch(() => {})}
              >
                Copy codes
              </Button>
              <Button type="button" onClick={() => setStep("confirm")}>I’ve saved these</Button>
            </>
          ) : enrolled ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] text-[var(--ok)]">
                <Check className="size-4" /> Two-factor authentication is on.
              </p>
              <Button type="button" onClick={() => setStep("confirm")}>Continue</Button>
            </>
          ) : qrDataUrl ? (
            <form onSubmit={confirmCode} className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-[var(--ink3)]">
                Scan this with your authenticator app, then enter the 6-digit code it shows.
              </p>
              <Image src={qrDataUrl} alt="Two-factor QR code" width={180} height={180} className="self-center rounded-[10px] bg-white p-2" unoptimized />
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono tracking-[4px]"
                autoFocus
              />
              {error && <p role="alert" className="text-[12.5px] text-status-red">{error}</p>}
              <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Confirm code"}</Button>
            </form>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-[var(--qink)]">Add two-factor authentication</p>
              <p className="text-[12.5px] leading-relaxed text-[var(--ink3)]">
                {viewer.mfaRequired
                  ? "Your role can see and change things across the whole organisation, so a second factor is required."
                  : "A second factor keeps your account safe even if your password leaks. You can add it later from Settings."}
              </p>
              {error && <p role="alert" className="text-[12.5px] text-status-red">{error}</p>}
              <Button type="button" onClick={() => void startEnrolment()} disabled={busy}>
                {busy ? "Starting…" : "Set up two-factor"}
              </Button>
              {!viewer.mfaRequired && (
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  className="text-[12px] text-[var(--ink4)] underline-offset-2 hover:underline"
                >
                  Skip for now
                </button>
              )}
            </>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-[var(--qink)]">
            You’re a <span className="font-semibold">{viewer.roleLabel}</span>; you’ll land on the{" "}
            <span className="font-semibold">{viewer.personaLabel}</span> dashboard.
          </p>
          <div className="rounded-[10px] border border-[var(--w08)] p-3 text-[12px] text-[var(--ink3)]">
            <p className="flex items-center gap-1.5">
              <Check className="size-3.5 text-[var(--ok)]" /> Password set
            </p>
            <p className="mt-1 flex items-center gap-1.5">
              {enrolled ? (
                <>
                  <Check className="size-3.5 text-[var(--ok)]" /> Two-factor authentication on
                </>
              ) : (
                <span className="text-[var(--ink4)]">Two-factor not set up — you can add it in Settings.</span>
              )}
            </p>
          </div>
          {error && <p role="alert" className="text-[12.5px] text-status-red">{error}</p>}
          <Button type="button" onClick={() => void finish()} disabled={busy}>
            {busy ? "Finishing…" : "Go to my dashboard"}
          </Button>
        </div>
      )}
    </div>
  );
}
