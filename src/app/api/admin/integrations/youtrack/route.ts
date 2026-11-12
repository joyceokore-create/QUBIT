import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { flagEnabled } from "@/lib/flags";
import { BulkConnectInput, bulkConnectYoutrack, bulkDisconnectYoutrack, listYoutrackConnections, YoutrackBulkError } from "@/server/youtrack-bulk";

// Admin › Integrations — bulk YouTrack connect. GET lists every active project's state;
// POST connects the rows (one URL + one token, a key per project) and, by default, runs
// the first sync so YouTrack's own answer validates each row; DELETE disconnects.
// project:update is the gate (Heads / admins); the token never appears in a response.
export const dynamic = "force-dynamic";

const STATUS: Record<YoutrackBulkError["code"], number> = { FORBIDDEN: 403, DISABLED: 503 };

function fail(e: unknown) {
  if (e instanceof YoutrackBulkError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
  throw e;
}

export async function GET() {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: { rows: await listYoutrackConnections(guard.ctx), enabled: flagEnabled("youtrack") } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = BulkConnectInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Check the instance URL and the project keys." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await bulkConnectYoutrack(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}

const DeleteBody = z.object({ projectIds: z.array(z.string().uuid()).min(1).max(100) });

export async function DELETE(req: Request) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pass projectIds." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await bulkDisconnectYoutrack(guard.ctx, parsed.data.projectIds) });
  } catch (e) {
    return fail(e);
  }
}
