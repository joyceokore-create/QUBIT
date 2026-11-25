import { listProjects } from "@/server/projects";
import { assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/projects — listProjects (plan Phase 5). Delegation token only.
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "project:read" }, async (ctx) => {
  const rows = await listProjects(ctx, {});
  return {
    items: rows
      .filter((p) => !["Completed", "Cancelled"].includes(p.status))
      .map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, priority: p.priority, avgProgress: p.avgProgress, dueDate: p.dueDate, markets: p.orgUnits.map((o) => o.code) })),
  };
});
