import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { listUsers } from "@/server/users";

// GET /api/users — tenant members for people pickers (relocated from /api/v1 in the M0 cull).
export async function GET() {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const users = await listUsers(guard.ctx);
    return ok(users.map((u) => ({ id: u.id, name: u.name, email: u.email })));
  } catch (err) {
    return toErrorResponse(err);
  }
}
