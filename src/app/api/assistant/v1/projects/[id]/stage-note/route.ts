import { z } from "zod";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { statusNote } from "@/lib/workspace-schema";
import { getProjectPanelData, updateProject } from "@/server/projects";
import { AssistantError, assistantRoute, isDryRun, readBody } from "@/server/assistant/route";

// PATCH /api/assistant/v1/projects/{id}/stage-note[?dryRun=1] — setStageNote: the app's
// governance gate (project:stage, or the project's PM).
export const dynamic = "force-dynamic";

const Note = z.object({ statusNote });

export const PATCH = assistantRoute<{ id: string }>({ permission: "project:read" }, async (ctx, req, { id }) => {
  const input = await readBody(req, Note);
  if (!(can(ctx, "project:stage") || (await canWriteProject(ctx, id)))) throw new AssistantError("Only the project's PM or a Head can set its stage note.", 403);
  const p = await getProjectPanelData(ctx, id);
  if (!p) throw new AssistantError("No such project.", 404);
  if (isDryRun(req)) return { dryRun: true, project: p.code, from: p.statusNote, to: input.statusNote };
  await updateProject(ctx, id, { statusNote: input.statusNote });
  return { project: p.code, statusNote: input.statusNote };
});
