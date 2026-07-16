import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/api-guard";
import { generatePlan, TaskError } from "@/server/project-tasks";

type Ctx = { params: Promise<{ id: string }> };

// Body: pasted requirements text and/or a base64-encoded PDF (PDF handled by the mock —
// the internal text model can't read PDFs directly).
const Body = z.object({
  text: z.string().optional(),
  pdfBase64: z.string().optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }
  const { id } = await params;
  const session = await auth();
  try {
    const plan = await generatePlan(guard.ctx, id, {
      text: parsed.data.text,
      pdfBase64: parsed.data.pdfBase64,
      tenantName: session?.user?.tenantName ?? "your organization",
    });
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof TaskError) {
      const status = e.code === "AI_UNAVAILABLE" ? 503 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}
