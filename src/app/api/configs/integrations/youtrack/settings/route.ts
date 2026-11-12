import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { StatusMapInput, SyncSettingsInput, setYoutrackStatusMap, setYoutrackSyncSettings } from "@/server/integrations/youtrack";
import { fail, invalid } from "../_http";

// PUT: non-secret settings on the tenant credential. A body with `stateMap` sets the
// YouTrack-state → QUBIT-status map; otherwise it is treated as sync settings
// (syncIntervalMinutes / firstImportSince / archiveRemoved). Returns the refreshed status.
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return invalid("Send the settings to save.");
  try {
    if ("stateMap" in body) {
      const parsed = StatusMapInput.safeParse(body);
      if (!parsed.success) return invalid("Each YouTrack state must map to a QUBIT task status.");
      return NextResponse.json({ data: await setYoutrackStatusMap(guard.ctx, parsed.data) });
    }
    const parsed = SyncSettingsInput.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the sync settings.");
    return NextResponse.json({ data: await setYoutrackSyncSettings(guard.ctx, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}
