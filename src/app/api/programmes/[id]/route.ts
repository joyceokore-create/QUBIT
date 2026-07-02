import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getProgrammePanelData } from "@/server/projects";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("portfolio:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const programme = await getProgrammePanelData(guard.ctx, id);
  if (!programme) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Programme not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(programme);
}
