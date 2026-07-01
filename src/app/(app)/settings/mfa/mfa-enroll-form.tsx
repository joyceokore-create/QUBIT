"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "enrolling" | "verifying" | "done";

export function MfaEnrollForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

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
      setError(body?.error?.message ?? "Verification failed.");
      setStatus("enrolling");
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return <p className="text-sm text-status-green">Two-factor authentication is now enabled.</p>;
  }

  if (!qrDataUrl) {
    return (
      <Button onClick={startEnrollment} disabled={status === "enrolling"}>
        {status === "enrolling" ? "Generating…" : "Set up authenticator app"}
      </Button>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote image */}
      <img
        src={qrDataUrl}
        alt="Authenticator app enrollment QR code"
        width={200}
        height={200}
        className="self-center"
      />
      <Input
        inputMode="numeric"
        placeholder="123456"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-status-red">
          {error}
        </p>
      )}
      <Button type="submit" disabled={status === "verifying"}>
        {status === "verifying" ? "Verifying…" : "Verify and enable"}
      </Button>
    </form>
  );
}
