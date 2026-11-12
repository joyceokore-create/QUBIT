import { NextResponse } from "next/server";
import { IntegrationError } from "@/server/integrations/youtrack";

// Shared error mapping for the Configs › Integrations › YouTrack routes. Not a route itself.

const STATUS: Record<IntegrationError["code"], number> = {
  FORBIDDEN: 403,
  NOT_CONNECTED: 409,
  TEST_FAILED: 400,
  BAD_INPUT: 400,
};

/** Map a typed IntegrationError to JSON; rethrow anything unexpected. */
export function fail(e: unknown): NextResponse {
  if (e instanceof IntegrationError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
  }
  throw e;
}

export function invalid(message: string): NextResponse {
  return NextResponse.json({ error: { code: "VALIDATION", message } }, { status: 400 });
}
