import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import {
  addProjectDependency,
  listProjectDependencies,
  ProjectDependencyError,
  removeProjectDependency,
} from "@/server/project-dependencies";

type Ctx = { params: Promise<{ id: string }> };

// M-P2c (docs/33) — cross-PROJECT dependencies (task-level lives at
// /api/tasks/[id]/dependencies). Read is project:read; writes are delivery-owner
// scoped in the engine (canWriteProject).

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  return NextResponse.json(await listProjectDependencies(guard.ctx, id));
}

const PostBody = z.object({
  dependsOnProjectId: z.string().uuid(),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    const dep = await addProjectDependency(guard.ctx, id, parsed.data.dependsOnProjectId, parsed.data.note);
    return NextResponse.json({ dependency: { id: dep.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectDependencyError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const dependsOn = new URL(req.url).searchParams.get("dependsOn");
  if (!dependsOn) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "dependsOn is required." } }, { status: 400 });
  }
  try {
    return NextResponse.json(await removeProjectDependency(guard.ctx, id, dependsOn));
  } catch (e) {
    if (e instanceof ProjectDependencyError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}
