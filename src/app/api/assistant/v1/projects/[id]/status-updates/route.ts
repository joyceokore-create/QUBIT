import { listStatusUpdates } from "@/server/status-updates";
import { assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/projects/{id}/status-updates — listStatusUpdates (plan Phase 5).
export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>({ permission: "project:read" }, async (ctx, _req, { id }) => ({
  items: (await listStatusUpdates(ctx, id)).slice(0, 20).map((s) => ({ rag: s.rag, body: s.body, postedBy: s.postedByName, at: s.createdAt })),
}));
