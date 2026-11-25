import { z } from "zod";
import { can } from "@/lib/rbac";
import { canContributeToProject } from "@/lib/access";
import { createRisk, listRisks } from "@/server/risks";
import { riskScore, riskTitle } from "@/lib/risk-schema";
import { AssistantError, assistantRoute, isDryRun, readBody } from "@/server/assistant/route";

// GET  /api/assistant/v1/risks[?projectId] — listRisks.
// POST /api/assistant/v1/risks[?dryRun=1] — raiseRisk: the app's own gate (project membership).
export const dynamic = "force-dynamic";

export const GET = assistantRoute({ permission: "risk:read" }, async (ctx, req) => {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  return { items: (await listRisks(ctx, projectId ? { projectId } : {})).map((r) => ({ id: r.id, title: r.title, probability: r.probability, impact: r.impact, status: r.status, projectCode: r.projectCode })) };
});

const RaiseRisk = z.object({ projectId: z.string().uuid(), title: riskTitle, probability: riskScore("a probability"), impact: riskScore("an impact"), mitigation: z.string().trim().max(2000).optional() });

export const POST = assistantRoute({ permission: "risk:read" }, async (ctx, req) => {
  const input = await readBody(req, RaiseRisk);
  if (!(await canContributeToProject(ctx, input.projectId)) && !can(ctx, "risk:write")) throw new AssistantError("You can only add risks to a project you're part of.", 403);
  if (isDryRun(req)) return { dryRun: true, wouldCreate: { type: "risk", ...input } };
  const risk = await createRisk(ctx, input);
  return { id: risk.id, status: risk.status };
});
