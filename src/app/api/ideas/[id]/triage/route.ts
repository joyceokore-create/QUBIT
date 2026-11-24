import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { mergeTarget, parkReason } from "@/lib/idea-schema";
import { IdeaError, mergeIdea, parkIdea, setIdeaReviewing } from "@/server/ideas";

// M-P4a (docs/35 §1) — the three triage outcomes plus the lane move. Gated on
// `idea:triage` at the route AND asserted in the engine (the M-P3b belt-and-braces
// pattern): accept happens in the project wizard, so it is deliberately NOT here.
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), reviewing: z.boolean() }),
  z.object({ action: z.literal("park"), reason: parkReason }),
  z.object({ action: z.literal("merge"), projectId: mergeTarget }),
]);

const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, PROJECT_NOT_FOUND: 404 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("idea:triage");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const body = parsed.data;
    const data =
      body.action === "review"
        ? await setIdeaReviewing(guard.ctx, id, body.reviewing)
        : body.action === "park"
          ? await parkIdea(guard.ctx, id, body.reason)
          : await mergeIdea(guard.ctx, id, body.projectId);
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof IdeaError) {
      // A project that can't be found belongs to the merge picker.
      const fields = e.code === "PROJECT_NOT_FOUND" ? { projectId: e.message } : undefined;
      return NextResponse.json({ error: { code: e.code, message: e.message, ...(fields ? { fields } : {}) } }, { status: STATUS[e.code] ?? 409 });
    }
    throw e;
  }
}
