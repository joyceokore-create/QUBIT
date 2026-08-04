import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { ProjectError } from "@/server/projects";
import { CreateProjectWizardInput, createProjectFromWizard } from "@/server/project-wizard";

// M-P1c (docs/27) — the 7-step project wizard's single-transaction create.
export async function POST(req: Request) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;

  const parsed = CreateProjectWizardInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    const project = await createProjectFromWizard(guard.ctx, parsed.data);
    return NextResponse.json({ project: { id: project.id, code: project.code } }, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
