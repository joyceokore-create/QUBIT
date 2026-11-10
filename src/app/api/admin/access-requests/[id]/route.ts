import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, AccessRequestError } from "@/server/access-requests";

// UX11: an optional dismissal reason, kept on the audit row only.
const BodySchema = z.object({ status: z.enum(["REVIEWED", "DISMISSED"]), reason: z.string().trim().max(300).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid status." } }, { status: 400 });
  }

  try {
    const { status, reason } = parsed.data;
    if (reason) await reviewAccessRequest(guard.ctx, id, status, { reason });
    else await reviewAccessRequest(guard.ctx, id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
