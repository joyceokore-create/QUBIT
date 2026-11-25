import { reportableUserIds } from "@/lib/access";
import { listWorkload } from "@/server/resources";
import { assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/workload — listWorkload, scoped exactly like Ask Q's tool (§7): Heads,
// Executives and admins see everyone; a PM their project members; a Member only themselves.
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "project:read" }, async (ctx) => {
  const reportable = await reportableUserIds(ctx);
  const all = await listWorkload(ctx);
  const visible = reportable === "all" ? all : all.filter((w) => reportable.has(w.userId));
  return {
    scope: reportable === "all" ? "everyone" : "you and the people on your projects",
    people: visible.map((w) => ({ personName: w.name, totalPct: w.totalPct, overAllocated: w.totalPct > 100, projects: w.allocations.map((a) => a.projectName) })),
  };
});
