import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { completeTour, resetTour, shouldOfferTour } from "@/server/tour";

// /api/me/tour — the first-week walkthrough's one flag. GET answers whether to offer it
// (and the project to walk); POST { action: "complete" } stamps it, { action: "reset" }
// clears it. The column, not localStorage, is the record, so it holds across devices.

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await shouldOfferTour(guard.ctx) });
}

const Body = z.object({ action: z.enum(["complete", "reset"]) });

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "action must be complete or reset." } }, { status: 400 });
  if (parsed.data.action === "reset") {
    await resetTour(guard.ctx);
    return NextResponse.json({ data: { tourCompletedAt: null } });
  }
  const r = await completeTour(guard.ctx);
  return NextResponse.json({ data: { tourCompletedAt: r.tourCompletedAt.toISOString() } });
}
