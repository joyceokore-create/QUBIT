import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";

/**
 * Project status updates. Posting one notifies the project's managers and testers (PRD:
 * "status update that notifies the project managers and testers"). Tenant-scoped + audited.
 */

export const RAG = ["Green", "Amber", "Red"] as const;

export interface StatusUpdateRow {
  id: string;
  body: string;
  rag: string;
  postedByName: string | null;
  createdAt: Date;
}

export async function listStatusUpdates(ctx: TenantContext, projectId: string): Promise<StatusUpdateRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectStatusUpdate.findMany({
      where: { projectId },
      include: { postedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((s) => ({
      id: s.id,
      body: s.body,
      rag: s.rag,
      postedByName: s.postedBy?.name ?? null,
      createdAt: s.createdAt,
    }));
  });
}

export const PostStatusInput = z.object({
  body: z.string().min(1),
  rag: z.enum(RAG).optional(),
});
export type PostStatusInput = z.infer<typeof PostStatusInput>;

/** Post an update + notify PMs and testers on the project (excluding the poster). */
export async function postStatusUpdate(ctx: TenantContext, projectId: string, input: PostStatusInput) {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true, code: true, leadUserId: true },
    });

    const update = await tx.projectStatusUpdate.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        body: input.body,
        rag: input.rag ?? "Green",
        postedById: ctx.userId,
      },
    });

    // Recipients: the lead + members who are Project Managers or QA Leads (testers).
    const members = await tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });
    const recipients = new Set<string>();
    if (project.leadUserId) recipients.add(project.leadUserId);
    for (const m of members) {
      if (/project manager|qa lead|test/i.test(m.role)) recipients.add(m.userId);
    }
    recipients.delete(ctx.userId); // don't notify the poster

    const ragTag = update.rag === "Green" ? "🟢" : update.rag === "Amber" ? "🟡" : "🔴";
    await emitDomainEvent(tx, ctx, {
      type: "status_update.posted",
      entityType: "project_status_update",
      entityId: update.id,
      payload: { projectId, rag: update.rag },
      notify: [...recipients].map((userId) => ({
        userId,
        kind: "status_update",
        message: `${ragTag} Status update on ${project.name}: ${input.body.slice(0, 90)}`,
        link: `/projects/${projectId}`,
      })),
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "project_status_update",
      entityId: update.id,
      after: { rag: update.rag, notified: recipients.size },
    });

    return { id: update.id, notified: recipients.size };
  });
}
