import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { benchFor } from "@/server/staffing";

// M-P1d — candidates for a window: least booked first, leave-in-window surfaced.
// Powers the assign panel and the Head's fill dialog. project:read is the gate: the
// data is names + load percentages, the same thing /people already shows.
export async function GET(req: Request) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const start = new Date(url.searchParams.get("start") ?? Date.now());
  const rawEnd = url.searchParams.get("end");
  const end = rawEnd ? new Date(rawEnd) : new Date(start.getTime() + 30 * 86_400_000);
  if (Number.isNaN(+start) || Number.isNaN(+end) || start > end) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Bad window." } }, { status: 400 });
  }
  // DM1.73 — optional ?role= activates the role-fit soft sort (docs/29 §3).
  const role = url.searchParams.get("role")?.slice(0, 60) || undefined;
  return NextResponse.json({ data: await benchFor(guard.ctx, start, end, role) });
}
