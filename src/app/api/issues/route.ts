import { NextResponse } from "next/server";
import { forbidden, requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { can } from "@/lib/rbac";
import { canContributeToProject } from "@/lib/access";
import { createIssue, CreateIssueInput, IssueError, listIssues } from "@/server/issues";

export async function GET(req: Request) {
  const guard = await requirePermission("issue:read");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const items = await listIssues(guard.ctx, {
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    ownerId: searchParams.get("owner") ?? undefined,
    // DM1.73: the workspace Register calls with ?projectId=; the /risks page's older
    // ?project= form keeps working.
    projectId: searchParams.get("projectId") ?? searchParams.get("project") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ items });
}

/**
 * POST /api/issues — UX fidelity Tier 2, "+ New Issue". Reading issues is the floor
 * (issue:read); raising one needs project contribution for a project issue, or issue:create
 * (the Head of QA, Heads, Super Admin) for any project or none. Zod-validated; audited by
 * the engine, which refuses another tenant's project or owner.
 */
export async function POST(req: Request) {
  const guard = await requirePermission("issue:read");
  if ("response" in guard) return guard.response;
  const parsed = CreateIssueInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const projectId = parsed.data.projectId ?? null;
  const allowed = can(guard.ctx, "issue:create") || (projectId ? await canContributeToProject(guard.ctx, projectId) : false);
  if (!allowed) return forbidden("You can only raise issues on a project you're part of.");
  try {
    const issue = await createIssue(guard.ctx, parsed.data);
    return NextResponse.json({ id: issue.id, status: issue.status }, { status: 201 });
  } catch (e) {
    if (e instanceof IssueError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    throw e;
  }
}
