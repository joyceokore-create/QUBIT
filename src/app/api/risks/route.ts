import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canContributeToProject } from "@/lib/access";
import { listRisks, createRisk, CreateRiskInput, RiskError } from "@/server/risks";

export async function GET(req: Request) {
  const guard = await requirePermission("risk:read");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const items = await listRisks(guard.ctx, {
    status: searchParams.get("status") ?? undefined,
    ownerId: searchParams.get("owner") ?? undefined,
    // DM1.73: the workspace Register calls with ?projectId=; the /risks page's older
    // ?project= form keeps working.
    projectId: searchParams.get("projectId") ?? searchParams.get("project") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  // Everyone can read; writing a risk is gated on being part of the project (below).
  const guard = await requirePermission("risk:read");
  if ("response" in guard) return guard.response;

  const parsed = CreateRiskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  // A project-scoped risk needs project membership; a tenant-level risk (no project) is a
  // management action.
  const projectId = parsed.data.projectId ?? null;
  const allowed = projectId ? await canContributeToProject(guard.ctx, projectId) : can(guard.ctx, "risk:write");
  if (!allowed) return forbidden("You can only add risks to a project you're part of.");

  try {
    const risk = await createRisk(guard.ctx, parsed.data);
    return NextResponse.json({ id: risk.id, status: risk.status, createdAt: risk.createdAt }, { status: 201 });
  } catch (e) {
    if (e instanceof RiskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
