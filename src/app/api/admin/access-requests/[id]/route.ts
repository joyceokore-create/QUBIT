import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, AccessRequestError } from "@/server/access-requests";

const BodySchema = z.object({ status: z.enum(["REVIEWED", "DISMISSED"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid status." } }, { status: 400 });
  }

  try {
    await reviewAccessRequest(guard.ctx, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
