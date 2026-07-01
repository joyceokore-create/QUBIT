"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoginFormProps {
  callbackUrl: string;
}

type OrgLookup =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; tenantName: string }
  | { status: "not-found" };

// A domain needs at least one dot to be worth looking up — skips a request per keystroke
// while the user is still typing "amina.ndungu@kcb.exam...".
function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
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
        const res = await fetch(`/api/auth/resolve-org?email=${encodeURIComponent(email)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setOrg({ status: "found", tenantName: data.tenantName });
        } else {
          setOrg({ status: "not-found" });
        }
      } catch {
        // Aborted (superseded by a newer keystroke) or a network hiccup — either way,
        // this is a UX nicety, not the source of truth, so fail quiet.
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

    const result = await signIn("credentials", {
      email,
      password,
      totpCode: totpCode || undefined,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Invalid email, password, or authentication code.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in to QUBIT</CardTitle>
        <CardDescription>Enterprise Portfolio &amp; Programme Management</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink-2">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="min-h-[1em] text-xs" aria-live="polite">
              {org.status === "found" && (
                <span className="text-status-green">Signing in to {org.tenantName}</span>
              )}
              {org.status === "not-found" && (
                <span className="text-ink-3">
                  We couldn&apos;t match this email to an organization.
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ink-2">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="totpCode" className="text-sm font-medium text-ink-2">
              Authenticator code <span className="text-ink-3">(if enabled)</span>
            </label>
            <Input
              id="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-red">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
