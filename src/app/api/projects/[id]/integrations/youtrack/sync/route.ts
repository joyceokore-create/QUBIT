import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { flagEnabled } from "@/lib/flags";
import { SyncError, syncProject } from "@/server/connectors/youtrack-sync";

// POST /api/projects/:id/integrations/youtrack/sync — pull now, rather than waiting for
// the poll (BRD FR-INT-05). Body: { full?: boolean } re-reads every issue instead of only
// those changed since the last run — needed after a field-mapping change.
//
// Gated on project:update: this reaches out to a third party and writes tasks, so it sits
// with the people who configure the integration, not with everyone who can read the board.

export const runtime = "nodejs";

const STATUS: Record<SyncError["code"], number> = {
  NOT_CONNECTED: 409,
  BAD_CONFIG: 400,
  AUTH: 502,
  UNAVAILABLE: 502,
};

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  if (!flagEnabled("youtrack")) {
    return NextResponse.json(
      { error: { code: "DISABLED", message: "YouTrack sync is turned off." } },
      { status: 503 },
    );
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { full?: boolean };
  try {
    return NextResponse.json({ data: await syncProject(guard.ctx, id, { full: body.full === true }) });
  } catch (e) {
    if (e instanceof SyncError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    throw e;
  }
}
