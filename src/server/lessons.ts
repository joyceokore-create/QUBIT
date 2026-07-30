import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Lessons learned (docs/16 §6 — a direct stakeholder ask). Captured on the project as
 * it runs, not reconstructed at the end, and required by the closure gate: a project
 * that taught nobody anything did not close.
 */

export const LESSON_CATEGORIES = ["WhatWentWell", "WhatDidNot", "Recommendation"] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export const LESSON_LABELS: Record<LessonCategory, string> = {
  WhatWentWell: "What went well",
  WhatDidNot: "What didn't",
  Recommendation: "Recommendation",
};

export interface LessonRow {
  id: string;
  title: string;
  detail: string | null;
  category: LessonCategory;
  authorName: string | null;
  createdAt: Date;
}

export async function listLessons(ctx: TenantContext, projectId: string): Promise<LessonRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.lessonLearned.findMany({
      where: { projectId },
      select: {
        id: true, title: true, detail: true, category: true, createdAt: true,
        author: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      category: r.category as LessonCategory,
      authorName: r.author?.name ?? null,
      createdAt: r.createdAt,
    }));
  });
}

export const AddLessonInput = z.object({
  title: z.string().trim().min(3, "Say what the lesson is.").max(200),
  detail: z.string().trim().max(1000).nullable().optional(),
  category: z.enum(LESSON_CATEGORIES),
});
export type AddLessonInputT = z.infer<typeof AddLessonInput>;

/** Any project member may record a lesson — the people who lived it are the ones who
 * know it. The gate that CONSUMES lessons stays governance-gated. */
export async function addLesson(
  ctx: TenantContext,
  projectId: string,
  input: AddLessonInputT,
): Promise<LessonRow[]> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.lessonLearned.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        title: input.title,
        detail: input.detail ?? null,
        category: input.category,
        authorId: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "lesson_learned",
      entityId: row.id,
      after: { projectId, title: input.title, category: input.category },
    });
  });
  return listLessons(ctx, projectId);
}
