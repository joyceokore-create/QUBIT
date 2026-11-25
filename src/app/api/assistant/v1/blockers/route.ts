import { listBlockers } from "@/server/blockers";
import { assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/blockers[?projectId] — listBlockers (plan Phase 5).
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "project:read" }, async (ctx, req) => {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  return { items: (await listBlockers(ctx, projectId ? { projectId } : {})).map((b) => ({ id: b.id, description: b.description, severity: b.severity, status: b.status, projectCode: b.projectCode })) };
});
