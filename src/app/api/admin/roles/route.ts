import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { createCustomRole, RolePermissionError } from "@/server/role-permissions";

const Body = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string().min(1)).max(200),
});

// Create a custom role (tuma-style permission bundle). PlatformSuperAdmin-only (roles:manage).
export async function POST(req: Request) {
  const guard = await requirePermission("roles:manage");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }

  try {
    const id = await createCustomRole(guard.ctx, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    if (e instanceof RolePermissionError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
