import { NextResponse } from "next/server";
import { flagEnabled } from "@/lib/flags";
import {
  MAX_BODY_BYTES,
  processPush,
  resolveGithubIntegration,
  verifyGithubSignature,
  type PushPayload,
} from "@/server/connectors/github-webhook";

// POST /api/webhooks/github — push events only (docs/15 §6.3). Machine-to-machine: no
// session, no cookies; authentication IS the HMAC signature, verified over the raw body
// with the integration's own secret. Excluded from the auth middleware (middleware.ts).
//
// DEPLOY NOTE: the reverse proxy at q.fikrawork.com MUST pass the body through untouched
// — any rewrite (re-encoding, pretty-printing, trailing newline) breaks the signature.
//
// Response discipline: GitHub retries on 5xx and timeouts, so bad input answers 2xx/4xx
// fast — 401 bad signature, 204 not-our-repo or wrong event, 200 processed/replay.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!flagEnabled("commitAutomation")) {
    return NextResponse.json({ error: "Commit automation is turned off." }, { status: 503 });
  }

  // Only push events carry commits; ping (sent on webhook creation) answers 200 so the
  // GitHub UI shows a green check when an admin wires the hook up.
  const event = req.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true });
  if (event !== "push") return new NextResponse(null, { status: 204 });

  const deliveryId = req.headers.get("x-github-delivery");
  if (!deliveryId) return NextResponse.json({ error: "Missing delivery id." }, { status: 400 });

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  // Parsing here is pure data extraction: repository.full_name is ONLY a lookup key for
  // our stored config, and nothing is acted on until the signature has passed.
  let payload: PushPayload;
  try {
    payload = JSON.parse(rawBody) as PushPayload;
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const resolved = await resolveGithubIntegration(payload.repository?.full_name ?? "");
  if (!resolved) return new NextResponse(null, { status: 204 }); // not our repo — silent

  if (!verifyGithubSignature(rawBody, req.headers.get("x-hub-signature-256"), resolved.webhookSecret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  const result = await processPush(resolved, payload, deliveryId);
  return NextResponse.json(result, { status: 200 });
}
