import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { lumiAutopilot } from "@/server/integrations/lumi";
import { fail, invalid } from "@/app/api/configs/integrations/youtrack/_http";

// GET  — Lumi's autopilot state and check report for QUBIT.
// POST { action: "on" | "refresh" | "off" } — switch it on with QUBIT's addresses, re-read
// lumi.yaml, or switch it off (plan Phase 5).
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await lumiAutopilot(guard.ctx, "status") });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({ action: z.enum(["on", "refresh", "off"]) });

export async function POST(req: Request) {
  const guard = await requirePermission("integrations:manage");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid("Pick on, refresh or off.");
  try {
    return NextResponse.json({ data: await lumiAutopilot(guard.ctx, parsed.data.action) });
  } catch (e) {
    return fail(e);
  }
}
