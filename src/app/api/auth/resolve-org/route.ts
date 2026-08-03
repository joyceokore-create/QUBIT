import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenantByEmailDomain } from "@/lib/tenant-domain";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";

const QuerySchema = z.object({ email: z.string().email() });

/**
 * Unauthenticated, pre-login lookup so the login form can show "Signing in to Riverbank Group"
 * as the user types their email. Domain-to-tenant mapping isn't secret (it's usually the
 * org's own public domain), but this is still rate-limited to deter bulk domain scraping.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ email: searchParams.get("email") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid email." } },
      { status: 400 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitKey = `resolve-org:${ip}`;
  const rl = checkRateLimit(rateLimitKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      { status: 429 },
    );
  }

  const tenant = await resolveTenantByEmailDomain(parsed.data.email);
  if (!tenant) {
    recordFailure(rateLimitKey);
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({ found: true, tenantName: tenant.name, tenantSlug: tenant.slug });
}
