import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { connectTeams, disconnectTeams, getTeamsStatus, TeamsConnectInput } from "@/server/integrations/teams";
import { fail, invalid } from "@/app/api/configs/integrations/youtrack/_http";

// Configs › Integrations › Microsoft Teams — the channel the approved roll-up is posted to.
//   GET    — status (never the webhook URL)
//   POST   { webhookUrl, channel? } — post a test message, then save
//   DELETE — disconnect
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getTeamsStatus(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = TeamsConnectInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the webhook URL.");
  try {
    return NextResponse.json({ data: await connectTeams(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await disconnectTeams(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}
