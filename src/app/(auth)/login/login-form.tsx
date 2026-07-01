"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoginFormProps {
  tenants: { slug: string; name: string }[];
  callbackUrl: string;
}

export function LoginForm({ tenants, callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState(tenants[0]?.slug ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      tenantSlug,
      email,
      password,
      totpCode: totpCode || undefined,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Invalid organization, email, password, or authentication code.");
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
            <label htmlFor="tenantSlug" className="text-sm font-medium text-ink-2">
              Organization
            </label>
            <Select value={tenantSlug} onValueChange={(value) => setTenantSlug(value ?? "")}>
              <SelectTrigger id="tenantSlug" className="w-full">
                <SelectValue placeholder="Select your organization" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <Button type="submit" disabled={loading || !tenantSlug} className="mt-2">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
