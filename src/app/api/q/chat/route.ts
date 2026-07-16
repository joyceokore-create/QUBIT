import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/api-guard";
import { runQChat } from "@/server/q/agent";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).min(1).max(30),
  projectId: z.string().optional(),
});

// Agentic Q — free-form, tool-using chat grounded in the caller's tenant data.
export async function POST(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }
  const session = await auth();
  const result = await runQChat(guard.ctx, {
    messages: parsed.data.messages,
    projectId: parsed.data.projectId,
    tenantName: session?.user?.tenantName ?? "your organization",
  });
  return NextResponse.json(result);
}
