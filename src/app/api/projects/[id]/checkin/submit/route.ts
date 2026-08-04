import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canWriteProject } from "@/lib/access";
import { submitCheckInToHead } from "@/server/checkins";

// M-P3a (docs/34) — "Confirm & send to the Head of PMs": the confirmed check-in enters
// the Head's roll-up. Same PM-level gate as confirming.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canWriteProject(ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Sending the report is PM-level." } }, { status: 403 });
  }
  try {
    const row = await submitCheckInToHead(ctx, id);
    return NextResponse.json({ data: { submittedToHeadAt: row.submittedToHeadAt } }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIRMED", message: e instanceof Error ? e.message : "Confirm first." } },
      { status: 409 },
    );
  }
}
