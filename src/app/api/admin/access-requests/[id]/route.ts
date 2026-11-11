import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, AccessRequestError } from "@/server/access-requests";
import { DECLINE_REASON_VALUES } from "@/lib/access-request-schema";

// An optional decline reason as a FIXED code, kept on the audit row only (UX fidelity D-F3b:
// no free text, so the audit log holds no personal data once the request is deleted).
// Unknown keys (e.g. an old client's free-text `reason`) are stripped by Zod and ignored.
const BodySchema = z.object({ status: z.enum(["REVIEWED", "DISMISSED"]), reasonCode: z.enum(DECLINE_REASON_VALUES).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid status." } }, { status: 400 });
  }

  try {
    const { status, reasonCode } = parsed.data;
    await reviewAccessRequest(guard.ctx, id, status, reasonCode && status === "DISMISSED" ? { reasonCode } : {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
