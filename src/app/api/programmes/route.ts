import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { CreateProgrammeSchema, createProgramme, PortfolioError } from "@/server/portfolios";

// M-P1b (docs/27) — programme creation is deliberately light (docs/26 §5.2): a grouping,
// not a second project form. Exec / Head only.
export async function POST(req: Request) {
  const guard = await requirePermission("programme:create");
  if ("response" in guard) return guard.response;

  const parsed = CreateProgrammeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    const programme = await createProgramme(guard.ctx, parsed.data);
    return NextResponse.json({ programme: { id: programme.id, name: programme.name } }, { status: 201 });
  } catch (e) {
    if (e instanceof PortfolioError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
