import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { TestInput, connectYoutrack, replaceYoutrackToken } from "@/server/integrations/youtrack";
import { validationError } from "@/server/errors";
import { YoutrackReplaceTokenSchema } from "@/lib/youtrack-schema";
import { fail } from "../_http";

// POST: test then store the tenant credential (token encrypted; replaces any existing one).
// PUT: replace only the token, keeping the instance URL — re-tested before it is stored.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = TestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    return NextResponse.json({ data: await connectYoutrack(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

const ReplaceBody = YoutrackReplaceTokenSchema;

export async function PUT(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = ReplaceBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    return NextResponse.json({ data: await replaceYoutrackToken(guard.ctx, parsed.data.token) });
  } catch (e) {
    return fail(e);
  }
}
