import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { canAccessReport } from "@/server/q/access";
import { createShare } from "@/server/q/shares";

const Body = z.object({
  type: z.enum(["project", "resource", "portfolio", "manager", "member"]),
  targetId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  periodLabel: z.string().min(1).max(120),
  markdown: z.string().min(1).max(100_000),
  usedAi: z.boolean().optional(),
});

// Publish a report snapshot as a shareable link. Re-checks the same per-type access as
// generation (defence in depth), persists the rendered Markdown under the caller's tenant
// (RLS), audits it, and returns a token → an in-app, tenant-scoped share URL.
export async function POST(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }
  const { type, targetId, title, periodLabel, markdown, usedAi } = parsed.data;

  if (!canAccessReport(guard.ctx, type, targetId)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You don't have permission to share that report." } },
      { status: 403 },
    );
  }

  const { token } = await createShare(guard.ctx, {
    type,
    targetId,
    title,
    periodLabel,
    markdown,
    usedAi: Boolean(usedAi),
  });
  return NextResponse.json({ token, path: `/reports/s/${token}` });
}
