import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/api-guard";
import { draftBrd, DraftError } from "@/server/q/draft-brd";

type Ctx = { params: Promise<{ id: string }> };

// Q drafts a BRD from the project record and files it as PendingReview for the PM.
export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const session = await auth();
  try {
    const result = await draftBrd(guard.ctx, id, { tenantName: session?.user?.tenantName ?? "your organization" });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DraftError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
