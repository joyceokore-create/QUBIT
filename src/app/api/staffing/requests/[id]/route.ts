import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { cancelResourceRequest, declineResourceRequest, fillResourceRequest, StaffingError } from "@/server/staffing";

// M-P1d — resolve a request: fill / decline (Head, staffing:manage — checked in the
// engine) or cancel (the raiser withdrawing their own ask, or the Head — docs/27 §5
// gap 4). Session-only here; every action's authorization lives in the engine.

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fill"), userId: z.string().uuid() }),
  z.object({ action: z.literal("decline"), reason: z.string().min(1).max(300) }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(300).optional() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    const result =
      parsed.data.action === "fill"
        ? await fillResourceRequest(guard.ctx, id, parsed.data.userId)
        : parsed.data.action === "decline"
          ? await declineResourceRequest(guard.ctx, id, parsed.data.reason)
          : await cancelResourceRequest(guard.ctx, id, parsed.data.reason);
    return NextResponse.json({ request: { id: result.id, status: result.status } });
  } catch (e) {
    if (e instanceof StaffingError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}
