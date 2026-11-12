import { NextResponse } from "next/server";
import type { z } from "zod";
import { DecisionError } from "@/server/decision-requests";
import { validationError } from "@/server/errors";

// WS2 — shared response helpers for the /api/decisions routes (not a route itself).

const STATUS: Record<DecisionError["code"], number> = { FORBIDDEN: 403, NOT_FOUND: 404, BAD_INPUT: 400, CONFLICT: 409 };

export function invalid(error: z.ZodError): NextResponse {
  return validationError(error);
}

/** The field a rejection belongs to, when it is about one (docs/08 § Errors); else form-level. */
function fieldOf(e: DecisionError): string | undefined {
  if (e.code === "BAD_INPUT") return "dueDate";
  if (e.code === "NOT_FOUND" && /^Project/.test(e.message)) return "projectId";
  if (e.code === "NOT_FOUND" && /^Owner/.test(e.message)) return "ownerId";
  return undefined;
}

/** A DecisionError → its HTTP status; anything else is rethrown (a real 500). */
export function engineError(e: unknown): NextResponse {
  if (e instanceof DecisionError) {
    const field = fieldOf(e);
    return NextResponse.json({ error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } }, { status: STATUS[e.code] });
  }
  throw e;
}

/** Route ids are cuid/uuid-shaped; anything else is a 404 before it reaches Prisma. */
export const isId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
