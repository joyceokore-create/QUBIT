import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { TestInput, testYoutrack } from "@/server/integrations/youtrack";
import { fail, invalid } from "../_http";

// POST: test a candidate instance URL + token WITHOUT saving — reachable / token valid /
// projects visible / whether the token looks like a person's. The connect screen's proof.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = TestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the instance URL and token.");
  try {
    return NextResponse.json({ data: await testYoutrack(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}
