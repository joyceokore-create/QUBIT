import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * API error envelope + typed errors (docs/clickup-transformation/05-api-spec.md).
 * Errors serialize to `{ error: { code, message, fields? } }` with the right status.
 * Cross-tenant access surfaces as 404 (never 403) so we don't leak existence.
 */

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS[this.code];
  }
}

/** Cross-tenant or missing object — always 404 to avoid existence leaks. */
export class NotFoundError extends ApiError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You don't have access to do that.") {
    super("FORBIDDEN", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Version conflict.") {
    super("CONFLICT", message);
  }
}

/** Domain-rule violation (e.g. dependency cycle) — 422. */
export class UnprocessableError extends ApiError {
  constructor(message: string, fields?: Record<string, string>) {
    super("UNPROCESSABLE", message, fields);
  }
}

/** Serialize any thrown error to the standard envelope. Unknown errors → 500 (message hidden). */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "_"] = issue.message;
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid request.", fields } },
      { status: 400 },
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) } },
      { status: err.status },
    );
  }
  // Never leak internals.
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500 },
  );
}

/** Success envelope helper: `{ data, meta? }`. */
export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ data, ...(meta && { meta }) });
}

