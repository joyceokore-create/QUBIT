import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { retestYoutrack } from "@/server/integrations/youtrack";
import { fail } from "../_http";

// POST: re-run the connection test with the STORED token ("Test again") and refresh
// status / last-checked / last-error on the tenant credential.
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await retestYoutrack(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}
