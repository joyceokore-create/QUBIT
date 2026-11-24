import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { validationError } from "@/server/errors";
import { GateApprovalError, type GateApprovalErrorCode } from "@/server/gate-approval";

// WS1 — one error mapping for the gate sign-off routes (submit / approve / return / review).
const STATUS: Record<GateApprovalErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_APPROVER: 403,
  FOUR_EYES: 403,
  NOT_SUBMITTED: 409,
  ALREADY_DONE: 409,
  ALREADY_SUBMITTED: 409,
  NOT_SIGN_OFF: 409,
  NEEDS_EXCEPTION: 409,
  NO_EXCEPTION: 409,
  NOTE_REQUIRED: 400,
};

/** Maps the engine's refusals to HTTP; anything else is rethrown (a 500, logged). */
export function gateErrorResponse(e: unknown): NextResponse {
  if (e instanceof GateApprovalError) {
    // docs/08 § Errors: a missing reason belongs to the Decision Note field.
    const fields = e.code === "NOTE_REQUIRED" ? { note: e.message } : undefined;
    return NextResponse.json({ error: { code: e.code, message: e.message, ...(fields ? { fields } : {}) } }, { status: STATUS[e.code] });
  }
  if (e instanceof ZodError) return validationError(e);
  throw e;
}

export type GateParams = { params: Promise<{ id: string; checkpointStatusId: string }> };

/** Path ids are opaque strings; bound them before they reach a query. */
export const validId = (s: string) => s.length > 0 && s.length <= 64 && /^[A-Za-z0-9_-]+$/.test(s);
