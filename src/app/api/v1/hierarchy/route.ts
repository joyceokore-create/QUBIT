import { requirePermission } from "@/lib/api-guard";
import { getHierarchyTree } from "@/server/hierarchy";
import { ok, toErrorResponse } from "@/server/errors";

/**
 * GET /api/v1/hierarchy — full sidebar tree (spaces → folders → lists + task counts)
 * for the caller's tenant only. RLS guarantees isolation; a user in tenant A can never
 * see tenant B's tree. (docs/clickup-transformation/05-api-spec.md §Hierarchy)
 */
export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  try {
    const tree = await getHierarchyTree(guard.ctx);
    return ok(tree);
  } catch (err) {
    return toErrorResponse(err);
  }
}
