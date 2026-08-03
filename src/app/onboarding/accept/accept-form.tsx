"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The invite-accept form (docs/22 §6). Deliberately NOT the authenticated onboarding form:
 * this caller has no session, so it posts the token alongside the password and lands on a
 * "now sign in" state rather than redirecting into the app. Same field rules either way.
 */
export function AcceptForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/onboarding/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not set your password.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-5 flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-[var(--ink2)]">
          Your password is set. You can sign in now.
        </p>
        <Link href="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ac-pw" className="text-[12.5px] font-medium text-[var(--ink2)]">
          Choose a password
        </label>
        <Input id="ac-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <p className="text-[11px] text-[var(--ink4)]">At least 8 characters; don’t reuse a recent password.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ac-confirm" className="text-[12.5px] font-medium text-[var(--ink2)]">
          Confirm password
        </label>
        <Input id="ac-confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-status-red">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="mt-1">
        {loading ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
