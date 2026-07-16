"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OnboardingForm() {
  return (
    <SessionProvider>
      <OnboardingFormInner />
    </SessionProvider>
  );
}

function OnboardingFormInner() {
  const router = useRouter();
  const { update } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setLoading(false);
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not set your password.");
      return;
    }
    // Lift the onboarding gate in the session token, then continue into the app.
    await update({ mustChangePassword: false });
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3" noValidate>
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
      <Button type="submit" disabled={loading} className="mt-1">
        {loading ? "Saving…" : "Set password & continue"}
      </Button>
    </form>
  );
}
