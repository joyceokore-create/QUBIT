import { NextResponse } from "next/server";
import { accessRequestSchema } from "@/lib/access-request-schema";
import { prisma } from "@/lib/db";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";

/**
 * Unauthenticated public intake for the "Get started" request-access form. Writes a
 * system-level access_request row (no tenant context — see docs/04-multitenancy.md).
 * Rate-limited per IP (shared in-memory limiter) and honeypot-guarded against bots.
 */
export async function POST(req: Request) {
  // Single trusted proxy → last hop is the real client; leftmost values are client-spoofable.
  const ip =
    req.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() || "unknown";
  const key = `access-request:${ip}`;
  if (!checkRateLimit(key).allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordFailure(key);
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    recordFailure(key);
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }

  const { fullName, email, company, jobTitle, companyUrl } = parsed.data;

  // Honeypot filled → almost certainly a bot. Ack success, store nothing.
  if (companyUrl) {
    // Public write endpoint: count every accepted attempt (not just failures) toward the limit.
    recordFailure(key);
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  await prisma.accessRequest.create({ data: { fullName, email, company, jobTitle } });
  // Public write endpoint: count every accepted attempt (not just failures) toward the limit.
  recordFailure(key);
  return NextResponse.json({ ok: true }, { status: 201 });
}
