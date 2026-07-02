import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createProject, listProjects, CreateProjectInput, ProjectError } from "@/server/projects";

export async function GET(req: Request) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const items = await listProjects(guard.ctx, {
    status: searchParams.get("status") ?? undefined,
    orgUnitId: searchParams.get("orgUnit") ?? undefined,
    portfolioId: searchParams.get("portfolio") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;

  const parsed = CreateProjectInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    const project = await createProject(guard.ctx, parsed.data);
    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
