import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { RaiseRequestInput, raiseResourceRequest, StaffingError } from "@/server/staffing";

// M-P1d (docs/27) — raise a resource request. Scope is resource-level (the project's
// delivery owner), checked in the engine — no blanket permission fits.
export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const parsed = RaiseRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    const request = await raiseResourceRequest(guard.ctx, parsed.data);
    return NextResponse.json({ request: { id: request.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof StaffingError) {
      const status = e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}
