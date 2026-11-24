import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { ProjectError } from "@/server/projects";
import { validationError } from "@/server/errors";
import { PROJECT_ERROR_FIELD } from "@/lib/project-wizard-schema";
import { CreateProjectWizardInput, createProjectFromWizard } from "@/server/project-wizard";

// M-P1c (docs/27) — the 7-step project wizard's single-transaction create.
export async function POST(req: Request) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;

  const parsed = CreateProjectWizardInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const project = await createProjectFromWizard(guard.ctx, parsed.data);
    return NextResponse.json({ project: { id: project.id, code: project.code } }, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectError) {
      // docs/08 § Errors: a rejection that belongs to one field (e.g. code taken) goes on that field.
      const field = PROJECT_ERROR_FIELD[e.code];
      return NextResponse.json(
        { error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } },
        { status: 400 },
      );
    }
    throw e;
  }
}
