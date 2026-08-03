import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";
import { consumeInviteToken, InviteError } from "@/server/invites";

/**
 * POST /api/onboarding/accept — PUBLIC (docs/22 §6). The caller has no session by
 * definition: this is how an invited user first sets a password. The 256-bit token is the
 * capability; `consumeInviteToken` owns every check.
 *
 * Rate-limited per IP so the endpoint can't be used to grind tokens, and every rejection
 * returns the SAME message so it can't be used to discover which tokens exist.
 *
 * Excluded from the auth middleware alongside the other unauthenticated routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  // Single trusted proxy → the last hop is the real client (leftmost values are spoofable).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).pop() || "unknown";
  const key = `invite-accept:${ip}`;
  if (!checkRateLimit(key).allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again shortly." } },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    recordFailure(key);
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }

  try {
    const result = await consumeInviteToken(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof InviteError) {
      // A bad token counts against the limiter; a weak/reused password does not — that's
      // a legitimate user getting it wrong, not someone probing.
      if (e.code === "INVALID_TOKEN") recordFailure(key);
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
