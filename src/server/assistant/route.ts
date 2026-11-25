import "server-only";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";
import { AssistantAuthError, assistantContext } from "@/server/assistant/delegation";

/**
 * Plan Phase 5 — the one wrapper every /api/assistant/v1/* route goes through. It accepts
 * ONLY the Bearer delegation token (cookies are ignored here, so there is no CSRF surface),
 * checks the baseline permission the matching app route checks, and turns known errors into
 * plain JSON answers. Responses are never cached.
 */

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

const NO_STORE = { "cache-control": "no-store" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });

/** ?dryRun=1 (or true): check and describe the change, write nothing. */
export function isDryRun(req: Request): boolean {
  const v = new URL(req.url).searchParams.get("dryRun");
  return v === "1" || v === "true";
}

/** Parse the JSON body against a schema; a bad body is a 400 naming the first problem. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AssistantError(`${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

export function assistantRoute<P = Record<string, string>>(opts: { permission?: string }, fn: (ctx: TenantContext, req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, route: { params: Promise<unknown> }) => {
    let ctx: TenantContext;
    try {
      ctx = await assistantContext(req);
    } catch (e) {
      if (e instanceof AssistantAuthError) return fail(e.status, e.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", e.message);
      throw e;
    }
    if (opts.permission && !can(ctx, opts.permission)) return fail(403, "FORBIDDEN", "You don't have permission to do this.");
    try {
      const data = await fn(ctx, req, ((await route?.params) ?? {}) as P);
      return NextResponse.json(data, { headers: NO_STORE });
    } catch (e) {
      if (e instanceof AssistantError) return fail(e.status, e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : "VALIDATION", e.message);
      if (e instanceof ZodError) return fail(400, "VALIDATION", e.issues[0]?.message ?? "Check the request.");
      // Domain errors (RiskError, BlockerError, CheckInError…) carry a code and a safe message.
      // Database errors also carry a code: never echo those — they fall through as a 500.
      const isDb = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientValidationError;
      const code = e instanceof Error ? (e as unknown as { code?: unknown }).code : undefined;
      if (!isDb && e instanceof Error && typeof code === "string") return fail(409, code, e.message);
      throw e;
    }
  };
}
