import { listNudges } from "@/server/nudger";
import { assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/nudges[?projectId] — listNudges (plan Phase 5).
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "project:read" }, async (ctx, req) => {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  return { items: await listNudges(ctx, projectId) };
});
