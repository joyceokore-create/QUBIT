import { withTenant, type TenantContext } from "@/lib/tenant";
import { projectRag, ragRank } from "@/server/health";

/**
 * Dashboard delta feed (M1, docs/16-revamp-plan.md §3): "what changed since I last
 * looked", computed from the M0 domain-event outbox. The summariser is pure so the
 * rollup rules are unit-testable; getDeltaFeed handles the window + name lookups.
 */

export interface DeltaItem {
  tone: "bad" | "warn" | "ok" | "info";
  text: string;
  href?: string;
}

export interface DeltaEvent {
  type: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}

const STATUS_LABEL: Record<string, string> = {
  OnTrack: "On Track",
  AtRisk: "At Risk",
  Overdue: "Overdue",
  Planning: "Planning",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Roll raw outbox events into at most `limit` human lines, most severe first. */
export function summarizeDeltas(
  events: DeltaEvent[],
  projectNameById: Map<string, string>,
  viewerId: string,
  limit = 8,
): DeltaItem[] {
  const projectOf = (e: DeltaEvent): string | null => {
    const payload = (e.payload ?? {}) as { projectId?: string };
    if (payload.projectId) return payload.projectId;
    return e.entityType === "project" ? e.entityId : null;
  };
  // A project-scoped delta whose project no longer resolves is noise (the project was
  // deleted since the event fired) — drop it rather than say "on a project".
  const nameOf = (id: string | null): string | null => (id && projectNameById.get(id)) || null;
  const count = (map: Map<string, number>, key: string | null) => {
    if (!key || !projectNameById.has(key)) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const blockersOpened = new Map<string, number>();
  const blockersResolved = new Map<string, number>();
  const tasksCompleted = new Map<string, number>();
  // Last status transition wins per project (a project can move twice in a window).
  const statusChanges = new Map<string, { from: string; to: string }>();
  let assignedToMe = 0;

  for (const e of events) {
    const projectId = projectOf(e);
    switch (e.type) {
      case "blocker.opened":
        count(blockersOpened, projectId);
        break;
      case "blocker.resolved":
        count(blockersResolved, projectId);
        break;
      case "task.completed":
        count(tasksCompleted, projectId);
        break;
      case "project.status_changed": {
        const p = (e.payload ?? {}) as { from?: string; to?: string };
        if (projectId && p.from && p.to) {
          const existing = statusChanges.get(projectId);
          statusChanges.set(projectId, { from: existing?.from ?? p.from, to: p.to });
        }
        break;
      }
      case "task.assigned": {
        const p = (e.payload ?? {}) as { assigneeId?: string };
        if (p.assigneeId === viewerId) assignedToMe++;
        break;
      }
      default:
        break; // notification-centric events (join requests, BRD) stay in the bell
    }
  }

  const items: DeltaItem[] = [];

  for (const [projectId, change] of statusChanges) {
    const name = nameOf(projectId);
    if (!name || change.from === change.to) continue;
    const slipped = ragRank(change.to) > ragRank(change.from);
    const recovered = !slipped && projectRag(change.to) === "Green" && projectRag(change.from) !== "Green";
    if (!slipped && !recovered) continue;
    items.push({
      tone: slipped ? "bad" : "ok",
      text: `${name} ${slipped ? "slipped to" : "recovered to"} ${STATUS_LABEL[change.to] ?? change.to}`,
      href: `/projects/${projectId}`,
    });
  }
  for (const [projectId, n] of blockersOpened) {
    items.push({ tone: "bad", text: `${plural(n, "blocker")} opened on ${nameOf(projectId)}`, href: `/projects/${projectId}` });
  }
  if (assignedToMe > 0) {
    items.push({ tone: "warn", text: `${plural(assignedToMe, "task")} assigned to you`, href: "/my-tasks" });
  }
  for (const [projectId, n] of blockersResolved) {
    items.push({ tone: "ok", text: `${plural(n, "blocker")} resolved on ${nameOf(projectId)}`, href: `/projects/${projectId}` });
  }
  for (const [projectId, n] of tasksCompleted) {
    items.push({ tone: "ok", text: `${plural(n, "task")} completed on ${nameOf(projectId)}`, href: `/projects/${projectId}` });
  }

  const toneOrder: Record<DeltaItem["tone"], number> = { bad: 0, warn: 1, info: 2, ok: 3 };
  return items.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]).slice(0, limit);
}

export interface DeltaFeed {
  items: DeltaItem[];
  since: Date;
}

/**
 * Events since the viewer's last visit (floor: always at least the last 24h, so a quick
 * refresh doesn't blank the feed). Advances lastDashboardSeenAt at most hourly.
 */
export async function getDeltaFeed(ctx: TenantContext, limit = 8): Promise<DeltaFeed> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

  return withTenant(ctx, async (tx) => {
    const viewer = await tx.user.findUnique({
      where: { id: ctx.userId },
      select: { lastDashboardSeenAt: true },
    });
    const lastSeen = viewer?.lastDashboardSeenAt ?? weekAgo;
    const since = lastSeen < dayAgo ? lastSeen : dayAgo;

    const events = await tx.domainEvent.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { type: true, entityType: true, entityId: true, actorId: true, payload: true, createdAt: true },
    });

    const projectIds = new Set<string>();
    for (const e of events) {
      const payload = (e.payload ?? {}) as { projectId?: string };
      if (payload.projectId) projectIds.add(payload.projectId);
      if (e.entityType === "project") projectIds.add(e.entityId);
    }
    const projects = projectIds.size
      ? await tx.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, name: true } })
      : [];
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

    // Guard on the row's existence — a stale session for a reseeded/deleted user must
    // degrade to the default window, never 500 the dashboard.
    if (viewer && (!viewer.lastDashboardSeenAt || now.getTime() - viewer.lastDashboardSeenAt.getTime() > 3_600_000)) {
      await tx.user.updateMany({ where: { id: ctx.userId }, data: { lastDashboardSeenAt: now } });
    }

    return { items: summarizeDeltas(events, projectNameById, ctx.userId, limit), since };
  });
}
