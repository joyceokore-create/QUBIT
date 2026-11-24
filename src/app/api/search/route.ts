import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { search, SearchInput } from "@/server/search";

// GET /api/search?q= — the ⌘K search (UX3). Zod-validated, tenant-scoped (RLS), capped.
export async function GET(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = SearchInput.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid query." } }, { status: 400 });
  return NextResponse.json({ data: await search(guard.ctx, parsed.data.q) });
}
