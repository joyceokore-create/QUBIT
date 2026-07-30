import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import {
  AcceptCandidatesInput,
  RequirementError,
  acceptCandidates,
  extractCandidates,
  getCoverage,
  listRequirements,
} from "@/server/requirements";

// GET  /api/projects/:id/requirements                    — requirements + coverage
// POST /api/projects/:id/requirements { documentId }      — PROPOSE candidates (no write)
// POST /api/projects/:id/requirements { documentId, accepted } — accept the human's picks
//
// docs/16 §6: extraction never auto-applies. The propose call writes nothing at all;
// only the accept call, carrying what a person ticked, creates requirements.

const STATUS: Record<RequirementError["code"], number> = { NOT_FOUND: 404, BAD_INPUT: 400 };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const [requirements, coverage] = await Promise.all([listRequirements(guard.ctx, id), getCoverage(guard.ctx, id)]);
  return NextResponse.json({
    requirements,
    coverage,
    canEdit: can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  if (!(can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    if (Array.isArray(body?.accepted)) {
      const parsed = AcceptCandidatesInput.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
          { status: 400 },
        );
      }
      const requirements = await acceptCandidates(guard.ctx, id, parsed.data);
      return NextResponse.json({ requirements, coverage: await getCoverage(guard.ctx, id) });
    }
    if (!body?.documentId) {
      return NextResponse.json({ error: { code: "VALIDATION", message: "documentId is required." } }, { status: 400 });
    }
    // Propose only — nothing is written until the review screen sends `accepted`.
    return NextResponse.json(await extractCandidates(guard.ctx, body.documentId));
  } catch (e) {
    if (e instanceof RequirementError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    throw e;
  }
}
