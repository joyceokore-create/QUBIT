"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "enrolling" | "verifying" | "done";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid size-6 flex-none place-items-center rounded-full bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] text-[12px] font-bold tabular-nums text-[var(--brand)]">
      {n}
    </span>
  );
}

export function MfaEnrollForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  async function startEnrollment() {
    setError(null);
    setStatus("enrolling");
    const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
    if (!res.ok) {
      setError("Could not start enrollment. Try again.");
      setStatus("idle");
      return;
    }
    const data = await res.json();
    setSecret(data.secret);
    setQrDataUrl(data.qrDataUrl);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setError(null);
    setStatus("verifying");
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "That code didn't match. Check your app and try again.");
      setStatus("enrolling");
      return;
    }
    setStatus("done");
  }

  async function copyKey() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the key is visible to type manually */
    }
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-ok-bg [animation:rise_.35s_cubic-bezier(.22,1,.36,1)_both]">
          <Check className="size-7 text-ok" aria-hidden />
        </span>
        <p className="text-[15px] font-bold text-foreground">You&apos;re all set</p>
        <p className="max-w-[300px] text-center text-sm leading-[1.6] text-ink-3">
          Two-factor authentication is enabled. You&apos;ll be asked for a code from your app next
          time you sign in.
        </p>
      </div>
    );
  }

  // ── Intro (before enrollment) ──────────────────────────────────────────
  if (!qrDataUrl) {
    const steps = [
      { icon: Smartphone, text: "Install an authenticator app (Google Authenticator, 1Password, Authy…)" },
      { icon: QrCode, text: "Scan the QR code we generate for you" },
      { icon: Check, text: "Enter the 6-digit code to confirm and enable" },
    ];
    return (
      <div className="flex flex-col gap-5 text-left">
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <StepBadge n={i + 1} />
              <span className="flex items-center gap-2 text-[13.5px] leading-[1.5] text-ink-2">
                <s.icon className="size-4 flex-none text-ink-4" aria-hidden />
                {s.text}
              </span>
            </li>
          ))}
        </ol>
        <Button className="w-full" onClick={startEnrollment} disabled={status === "enrolling"}>
          {status === "enrolling" ? "Generating…" : "Set up authenticator app"}
        </Button>
      </div>
    );
  }

  // ── Enrolling (QR + code) ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 text-left">
      {/* Step 1 — scan */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <StepBadge n={1} />
          <h2 className="text-[14px] font-bold text-foreground">Scan the QR code</h2>
        </div>
        <p className="text-[13px] leading-[1.6] text-ink-3">
          Open your authenticator app and scan the code below.
        </p>
        {/* QR stays on a solid white tile (with quiet-zone padding) so it scans
            reliably regardless of theme. */}
        <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote image */}
          <img src={qrDataUrl} alt="Authenticator app enrollment QR code" width={172} height={172} className="block" />
        </div>

        {/* Manual-entry fallback for when the camera can't scan. */}
        {!showKey ? (
          <button
            type="button"
            onClick={() => setShowKey(true)}
            className="mx-auto inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <KeyRound className="size-3.5" aria-hidden />
            Can&apos;t scan? Enter the key manually
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--w07)] bg-[var(--card2)] p-2 pl-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-[1.5] text-ink-2">{secret}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={copyKey}
              aria-label={copied ? "Copied" : "Copy setup key"}
            >
              {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
            </Button>
          </div>
        )}
      </section>

      {/* Step 2 — verify */}
      <form onSubmit={verify} className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <StepBadge n={2} />
          <h2 className="text-[14px] font-bold text-foreground">Enter the 6-digit code</h2>
        </div>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
          required
          aria-label="6-digit authenticator code"
          className="text-center text-lg font-semibold tracking-[0.4em]"
        />
        {error && (
          <p role="alert" className="text-[13px] text-status-red">
            {error}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={status === "verifying" || token.length < 6}>
          {status === "verifying" ? "Verifying…" : "Verify and enable"}
        </Button>
      </form>
    </div>
  );
}
