import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { UiModeInput } from "@/lib/ui-mode";
import { getUiMode, setUiMode } from "@/server/preferences";

// /api/me/ui-mode — the staged rollout's per-person switch (UX plan D11). GET returns the
// effective layout; POST { mode: "new" | "classic" } stores the caller's own choice (audited).

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: { mode: await getUiMode(guard.ctx) } });
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = UiModeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "mode must be new or classic." } }, { status: 400 });
  return NextResponse.json({ data: { mode: await setUiMode(guard.ctx, parsed.data.mode) } });
}
