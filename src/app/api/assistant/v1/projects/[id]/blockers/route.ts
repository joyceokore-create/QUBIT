import { canContributeToProject } from "@/lib/access";
import { createBlocker, CreateBlockerInput } from "@/server/blockers";
import { AssistantError, assistantRoute, isDryRun, readBody } from "@/server/assistant/route";

// POST /api/assistant/v1/projects/{id}/blockers[?dryRun=1] — raiseBlocker: the app's gate.
export const dynamic = "force-dynamic";

const RaiseBlocker = CreateBlockerInput.pick({ description: true, severity: true });

export const POST = assistantRoute<{ id: string }>({ permission: "project:read" }, async (ctx, req, { id }) => {
  const input = await readBody(req, RaiseBlocker);
  if (!(await canContributeToProject(ctx, id))) throw new AssistantError("You can only raise blockers on a project you're part of.", 403);
  if (isDryRun(req)) return { dryRun: true, wouldCreate: { type: "blocker", projectId: id, ...input } };
  const b = await createBlocker(ctx, id, input);
  return { id: b.id };
});
