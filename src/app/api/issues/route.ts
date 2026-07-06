import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listIssues } from "@/server/issues";

export async function GET(req: Request) {
  const guard = await requirePermission("issue:read");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const items = await listIssues(guard.ctx, {
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    ownerId: searchParams.get("owner") ?? undefined,
    projectId: searchParams.get("project") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ items });
}
