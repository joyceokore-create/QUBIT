import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { canWriteProject } from "@/lib/access";
import {
  DecisionInput,
  DocumentError,
  SubmitForReviewInput,
  documentProjectId,
  newVersion,
  recordDecision,
  submitForReview,
} from "@/server/documents";

// POST /api/documents/:id/review — the review workflow (docs/16 §6):
//   { approverIds }        submit a draft to NAMED approvers   → PM/lead gate
//   { decision, comment }  record MY decision                  → named approvers only
//   { newVersion: true }   raise the next version              → PM/lead gate
//
// The "named approvers only" rule lives in recordDecision, not here, so it holds for
// every caller rather than just this route.

const STATUS: Record<DocumentError["code"], number> = {
  NOT_FOUND: 404,
  BAD_INPUT: 400,
  BAD_STATE: 409,
  FORBIDDEN: 403,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  const projectId = await documentProjectId(ctx, id);
  if (!projectId) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!(await canViewProject(ctx, projectId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  try {
    if (body?.decision) {
      const parsed = DecisionInput.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid decision." } }, { status: 400 });
      }
      await recordDecision(ctx, id, parsed.data);
      return NextResponse.json({ ok: true });
    }

    // Submitting and versioning are author-side acts, gated like other project writes.
    if (!(await canWriteProject(ctx, projectId))) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    if (body?.newVersion) {
      return NextResponse.json(await newVersion(ctx, id, { title: body.title, content: body.content }));
    }
    const parsed = SubmitForReviewInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
        { status: 400 },
      );
    }
    await submitForReview(ctx, id, parsed.data.approverIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DocumentError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    throw e;
  }
}
