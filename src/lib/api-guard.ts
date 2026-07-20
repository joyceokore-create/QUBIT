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

/** Standard 403 for a secondary, resource-scoped authorization check (run after
 * requirePermission authenticates + confirms the baseline read capability). */
export function forbidden(message = "You don't have permission to do this."): NextResponse {
  return NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status: 403 });
}
