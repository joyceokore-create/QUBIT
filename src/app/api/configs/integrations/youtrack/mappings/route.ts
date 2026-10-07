import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { SaveMappingsInput, saveYoutrackMappings } from "@/server/integrations/youtrack";
import { fail, invalid } from "../_http";

// PUT: persist per-project mappings { projectId, ytKey | null, sync }. A YouTrack project
// maps to at most one QUBIT project; a null key clears the mapping. Per-row results —
// one bad row never costs the others.
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = SaveMappingsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the mappings.");
  try {
    return NextResponse.json({ data: await saveYoutrackMappings(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}
