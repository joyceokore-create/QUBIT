import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { nudgeUnsentCheckins, NudgeError } from "@/server/nudger";

// Milestone B — the Head nudges ONE project's PM about this week's missing status
// update (the inbox row's Nudge button). `targeted: 0` means the project already sent.

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    return NextResponse.json({ data: await nudgeUnsentCheckins(guard.ctx, new Date(), { projectId: id }) });
  } catch (e) {
    if (e instanceof NudgeError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 403 });
    }
    throw e;
  }
}
