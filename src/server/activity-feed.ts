import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * Per-project activity feed (M4) — read straight from the M0 domain-event outbox.
 * One write path, many reactions: nothing here is recorded separately; the feed is a
 * projection of what already happened.
 */

export interface ActivityItem {
  id: string;
  text: string;
  actorName: string | null; // null = machine actor (nudger, jobs)
  type: string;
  createdAt: Date;
}

/** Human line per event type — pure, unit-tested. Unknown types fall back readably. */
export function formatActivity(type: string, payload: Record<string, unknown>): string {
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  switch (type) {
    case "task.assigned":
      return "assigned a task";
    case "task.completed":
      return "completed a task";
    case "task.ready_for_qa":
      return "sent a bug back for verification";
    case "blocker.opened":
      return "flagged a blocker";
    case "blocker.resolved":
      return "resolved a blocker";
    case "status_update.posted":
      return `posted a ${String(payload.rag ?? "")} status update`.replace("  ", " ").trim();
    case "checkin.drafted":
      return "drafted the Friday check-in";
    case "checkin.confirmed":
      return `confirmed the Friday check-in (${String(payload.rag ?? "—")})`;
    case "comment.posted":
      return payload.reply ? "replied to a comment" : n(payload.mentions) > 0 ? "commented, mentioning teammates" : "commented";
    case "decision.recorded":
      return `recorded a decision: “${String(payload.title ?? "").slice(0, 80)}”`;
    case "project.status_changed":
      return `moved the project ${String(payload.from ?? "?")} → ${String(payload.to ?? "?")}`;
    case "join_request.created":
      return "asked to join the project";
    case "join_request.approved":
      return "approved a join request";
    case "join_request.denied":
      return "declined a join request";
    case "report.published":
      return "published the weekly report";
    case "nudge.created":
    case "nudge.escalated":
      return type === "nudge.escalated" ? "escalated a nudge" : "sent a nudge";
    case "document.brd_drafted":
      return "drafted a BRD with Q";
    default:
      return type.replace(/[._]/g, " ");
  }
}

export async function listProjectActivity(
  ctx: TenantContext,
  projectId: string,
  limit = 30,
): Promise<ActivityItem[]> {
  return withTenant(ctx, async (tx) => {
    const events = await tx.domainEvent.findMany({
      where: {
        OR: [
          { payload: { path: ["projectId"], equals: projectId } },
          { entityType: "project", entityId: projectId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const userActorIds = [...new Set(events.map((e) => e.actorId).filter((a): a is string => !!a && !a.startsWith("job:")))];
    const users = userActorIds.length
      ? await tx.user.findMany({ where: { id: { in: userActorIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return events.map((e) => ({
      id: e.id,
      text: formatActivity(e.type, (e.payload ?? {}) as Record<string, unknown>),
      actorName: e.actorId && !e.actorId.startsWith("job:") ? (nameById.get(e.actorId) ?? "Someone") : null,
      type: e.type,
      createdAt: e.createdAt,
    }));
  });
}
