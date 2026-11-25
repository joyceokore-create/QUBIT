import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { connectLumi, disconnectLumi, getLumiStatus, LumiConnectInput } from "@/server/integrations/lumi";
import { fail, invalid } from "@/app/api/configs/integrations/youtrack/_http";

// Configs › Integrations › Lumi (plans Phase 3 and 5).
//   GET    — status (never the secret)
//   POST   { baseUrl, clientId, clientSecret } — test with GET /v1/me, then save
//   DELETE — disconnect
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getLumiStatus(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = LumiConnectInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the connection details.");
  try {
    return NextResponse.json({ data: await connectLumi(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await disconnectLumi(guard.ctx) });
  } catch (e) {
    return fail(e);
  }
}
