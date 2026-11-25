import "server-only";
import { NextResponse } from "next/server";
import type { TenantContext } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { LumiError } from "@/server/connectors/lumi";
import { AssistantUnavailableError, openAssistantSession, type OpenSession } from "@/server/assistant/sessions";

/**
 * Plan Phase 5 — shared plumbing for the Ask Q panel's routes (/api/assistant/*, the
 * person's own cookie session). Every Lumi call runs with the person's assistant session;
 * an expired one is replaced once and the call retried. When the assistant is off, the
 * answer is 409 ASSISTANT_OFF and the panel falls back to the local Ask Q.
 */

const NO_STORE = { "cache-control": "no-store" };

export async function withAssistant(ctx: TenantContext, fn: (s: OpenSession) => Promise<Response>): Promise<Response> {
  const session = await auth();
  const who = { ...ctx, name: session?.user?.name ?? undefined };
  try {
    try {
      return await fn(await openAssistantSession(who));
    } catch (e) {
      if (e instanceof LumiError && e.status === 401) return await fn(await openAssistantSession(who, { fresh: true }));
      throw e;
    }
  } catch (e) {
    if (e instanceof AssistantUnavailableError) return NextResponse.json({ error: { code: "ASSISTANT_OFF", message: e.message } }, { status: 409, headers: NO_STORE });
    if (e instanceof LumiError) {
      const status = e.status === 429 ? 429 : e.status >= 500 ? 502 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.status === 429 ? "The assistant is busy. Try again in a minute." : "The assistant couldn't answer that." } }, { status, headers: NO_STORE });
    }
    throw e;
  }
}

/** Pass Lumi's event stream through unchanged (it holds no QUBIT or Lumi secret). */
export function sseResponse(upstream: Response): Response {
  return new Response(upstream.body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

export { NO_STORE };
