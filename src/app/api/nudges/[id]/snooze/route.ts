import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { snoozeNudge, SnoozeError } from "@/server/nudger";

// POST /api/nudges/[id]/snooze — "stop chasing ME about this" (M3). Per-user, per
// (entity, signal); the nudge keeps chasing everyone else. Body: { days? } (1–30).

const Body = z.object({ days: z.number().int().min(1).max(30).optional() });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "days must be 1–30." } }, { status: 400 });
  }
  const { id } = await params;
  try {
    const { until } = await snoozeNudge(ctx, id, parsed.data.days);
    return NextResponse.json({ data: { snoozedUntil: until } });
  } catch (err) {
    if (err instanceof SnoozeError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.code === "NOT_FOUND" ? 404 : 403 },
      );
    }
    throw err;
  }
}
