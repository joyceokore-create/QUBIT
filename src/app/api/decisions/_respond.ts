import { NextResponse } from "next/server";
import type { z } from "zod";
import { DecisionError } from "@/server/decision-requests";

// WS2 — shared response helpers for the /api/decisions routes (not a route itself).

const STATUS: Record<DecisionError["code"], number> = { FORBIDDEN: 403, NOT_FOUND: 404, BAD_INPUT: 400, CONFLICT: 409 };

export function invalid(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: { code: "VALIDATION", message: error.issues[0]?.message ?? "Invalid input." } }, { status: 400 });
}

/** A DecisionError → its HTTP status; anything else is rethrown (a real 500). */
export function engineError(e: unknown): NextResponse {
  if (e instanceof DecisionError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
  throw e;
}

/** Route ids are cuid/uuid-shaped; anything else is a 404 before it reaches Prisma. */
export const isId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
