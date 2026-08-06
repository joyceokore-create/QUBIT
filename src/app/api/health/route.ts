import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * M-P0a (docs/26 §11 P0, docs/36 §4) — the liveness/readiness probe.
 *
 * Deliberately UNAUTHENTICATED so `scripts/deploy.sh` and any uptime monitor can call it
 * (it is excluded from the middleware matcher for the same reason the machine routes are —
 * otherwise an unauthenticated probe gets a 302 to /login and reads as "healthy" to
 * anything that only checks for a 2xx/3xx).
 *
 * Because it is unauthenticated it says as little as possible: ok/degraded and which
 * dependency failed — never the driver message, never versions, never row counts. The real
 * error goes to the server log where an operator can see it.
 *
 * `SELECT 1` is deliberate: it proves the connection and the credentials without touching a
 * tenant-owned table, so it works regardless of RLS context (there is none here).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok", latencyMs: Date.now() - started },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[health] database probe failed:", e);
    return NextResponse.json(
      { status: "degraded", db: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
