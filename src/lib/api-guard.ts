import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";

type Guard = { ctx: TenantContext } | { response: NextResponse };

/**
 * The standard route-handler preamble from docs/06-api-spec.md: resolve the session (401
 * if none), then check the required permission (403 if missing). Every route handler
 * should call this first — never trust a client-supplied tenantId/role.
 */
export async function requirePermission(permission: string): Promise<Guard> {
  let ctx: TenantContext;
  try {
    ctx = await getTenantContext();
  } catch {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
        { status: 401 },
      ),
    };
  }

  if (!can(ctx, permission)) {
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "You don't have permission to do this." } },
        { status: 403 },
      ),
    };
  }

  return { ctx };
}

/** Session-only preamble (M-P1d): authenticate without a blanket permission, for routes
 * whose authorization is purely resource-scoped in the engine (e.g. "the project's own
 * lead/PM may raise a staffing request" — no role-level key expresses that). */
export async function requireSession(): Promise<Guard> {
  try {
    return { ctx: await getTenantContext() };
  } catch {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
        { status: 401 },
      ),
    };
  }
}

/** Standard 403 for a secondary, resource-scoped authorization check (run after
 * requirePermission authenticates + confirms the baseline read capability). */
export function forbidden(message = "You don't have permission to do this."): NextResponse {
  return NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status: 403 });
}

/** M-P2a (docs/33 §0, docs/25 §1): tasks live in YouTrack; QUBIT mirrors them read-only.
 * Every human task-authoring route answers with this. System writers (the YouTrack sync,
 * the commit webhook) never pass through these routes — they call engine paths directly. */
export function tasksAreMirrored(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "TASKS_ARE_MIRRORED",
        message: "Tasks are managed in YouTrack and mirrored here read-only. Connect or open YouTrack to change work items.",
      },
    },
    { status: 403 },
  );
}
