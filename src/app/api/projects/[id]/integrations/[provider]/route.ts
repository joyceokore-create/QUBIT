import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { setIntegration, SetIntegrationInput } from "@/server/integrations";

type Ctx = { params: Promise<{ id: string; provider: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = SetIntegrationInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }
  const { id, provider } = await params;
  try {
    await setIntegration(guard.ctx, id, provider, parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: { code: "BAD_PROVIDER", message: "Unknown integration." } }, { status: 400 });
  }
}
