"use client";

import { PasswordChecklist } from "@/components/auth/password-checklist";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { SetPasswordFormSchema } from "@/lib/password-schema";

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
  // docs/08 § Errors: too-short and mismatch show on their field; the button stays enabled.
  const fe = useFieldErrors({ schema: SetPasswordFormSchema, values: { password, confirm }, idPrefix: "ac" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate(["password", "confirm"])) return;
    setLoading(true);
    const res = await fetch("/api/onboarding/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not set your password.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields, ["password", "confirm"]);
        if (root) setError(root);
      } else {
        setError(message); // e.g. an expired or used link: not about a field
      }
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
          <Button className="w-full">Go to Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3" noValidate>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="flex flex-col gap-1.5">
        <Field label="Choose a Password" htmlFor={fe.idOf("password")} error={fe.errors.password}>
          <Input {...fe.bind("password")} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <PasswordChecklist password={password} />
      </div>
      <Field label="Confirm Password" htmlFor={fe.idOf("confirm")} error={fe.errors.confirm}>
        <Input {...fe.bind("confirm")} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" disabled={loading} className="mt-1">
        {loading ? "Saving…" : "Set Password"}
      </Button>
    </form>
  );
}
