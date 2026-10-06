import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { nudgeUnsentCheckins, NudgeError } from "@/server/nudger";

// Milestone B — the Head's "Nudge all": chase every active project with no sent status
// update THIS week. reports:read gets you to the door; the engine asserts the Head role.
// The nudger's weekly dedupe makes a second press a no-op (`skipped`), by design.

export async function POST() {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await nudgeUnsentCheckins(guard.ctx) });
  } catch (e) {
    if (e instanceof NudgeError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 403 });
    }
    throw e;
  }
}
