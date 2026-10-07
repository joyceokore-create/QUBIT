import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listYoutrackMappings, disconnectYoutrack } from "@/server/integrations/youtrack";
import { fail } from "./_http";

// Configs › Integrations › YouTrack. GET: the whole view (connection status, the projects
// this token can read, every QUBIT project's mapping + state + suggestion). DELETE:
// disconnect the tenant credential. Gate: integrations:manage. The token never appears.
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listYoutrackMappings(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    await disconnectYoutrack(guard.ctx);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return fail(e);
  }
}
