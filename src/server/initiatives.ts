import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { canTriageIdeas } from "@/server/ideas";
import { checkinSummaryByProject } from "@/server/checkins";
import { healthOf } from "@/lib/project-gate-view";
import {
  CARD_STAGES,
  changeLinesReady,
  isIntakeIdea,
  overlayShelved,
  projectInitiativeStage,
  type CardStage,
  type InitiativeRow,
  type StageHistory,
} from "@/lib/initiatives";

/**
 * UX10 (UX plan D8b) — the Portfolios page read: every initiative the viewer may see, plus
 * the per-stage counts seven days ago for the change lines. One RLS-scoped transaction for
 * the estate (projects, ideas, snapshots); the check-in health is its own scoped read.
 *
 * Ideas follow getIdeaBoard's rule: a triager (Head / super admin) sees every idea, anyone
 * else only their own submissions — and only with `idea:create` (the Ideas page's gate).
 */

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const OPEN_IDEAS = ["New", "Reviewing"];
const DECIDED_IDEAS = ["Accepted", "Parked", "Merged"];

export interface InitiativesData {
  rows: InitiativeRow[];
  history: StageHistory;
}

export async function getInitiatives(ctx: TenantContext, now = new Date()): Promise<InitiativesData> {
  const ideaScope = can(ctx, "idea:create") || canTriageIdeas(ctx) ? (canTriageIdeas(ctx) ? "all" : "own") : "none";
  const ideaWhere = ideaScope === "all" ? {} : { submittedById: ctx.userId };
  const today = utcDay(now);
  const weekAgoDay = new Date(today.getTime() - 7 * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [estate, checkins] = await Promise.all([
    withTenant(ctx, async (tx) => {
      const [projects, ideas, earliest, ref] = await Promise.all([
        tx.project.findMany({
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            pipelineStage: true,
            priority: true,
            stageEnteredAt: true,
            businessOwner: true,
            portfolio: { select: { id: true, name: true, category: true, ownerId: true } },
          },
        }),
        ideaScope === "none"
          ? Promise.resolve([])
          : tx.idea.findMany({
              // Open ideas, plus those decided within the week (to rebuild last week's Intake).
              where: { ...ideaWhere, OR: [{ status: { in: OPEN_IDEAS } }, { status: { in: DECIDED_IDEAS }, triagedAt: { gt: weekAgo } }] },
              select: {
                id: true,
                title: true,
                sponsor: true,
                status: true,
                createdAt: true,
                triagedAt: true,
                suggestedPortfolio: { select: { id: true, name: true } },
              },
            }),
        tx.projectSnapshot.findFirst({ where: { stage: { not: null } }, orderBy: { day: "asc" }, select: { day: true } }),
        // The snapshot day to compare against: the latest one at least a week back.
        tx.projectSnapshot.findFirst({ where: { stage: { not: null }, day: { lte: weekAgoDay } }, orderBy: { day: "desc" }, select: { day: true } }),
      ]);
      // The portfolio owner (Exec/Head) is the fallback sponsor; ownerId has no relation.
      const ownerIds = [...new Set(projects.map((p) => p.portfolio?.ownerId).filter((v): v is string => !!v))];
      const owners = ownerIds.length ? await tx.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
      const ready = changeLinesReady(earliest ? isoDay(earliest.day) : null, isoDay(today)) && !!ref;
      const snaps = ready && ref ? await tx.projectSnapshot.findMany({ where: { day: ref.day, stage: { not: null } }, select: { projectId: true, stage: true } }) : [];
      return { projects, ideas, ready, snaps, ownerName: new Map(owners.map((u) => [u.id, u.name])) };
    }),
    checkinSummaryByProject(ctx, now),
  ]);

  const rows: InitiativeRow[] = [];
  const categoryById = new Map<string, string | null>();
  for (const p of estate.projects) {
    categoryById.set(p.id, p.portfolio?.category ?? null);
    const { stage, reason } = projectInitiativeStage({ ...p, portfolioCategory: p.portfolio?.category ?? null });
    const c = checkins.get(p.id);
    rows.push({
      kind: "project",
      id: p.id,
      code: p.code,
      name: p.name,
      portfolio: p.portfolio ? { id: p.portfolio.id, name: p.portfolio.name } : null,
      stage,
      inactiveReason: reason,
      // Health is for work in progress; Live and Inactive projects carry none.
      health: stage === "Live" || stage === "Inactive" ? null : healthOf(c ? { rag: c.rag, confirmed: c.confirmed } : null),
      // The project's business owner (the idea's sponsor carries into it), else its portfolio's owner.
      sponsor: p.businessOwner ?? (p.portfolio?.ownerId ? (estate.ownerName.get(p.portfolio.ownerId) ?? null) : null),
      priority: p.priority,
      stageEnteredAt: p.stageEnteredAt ? p.stageEnteredAt.toISOString() : null,
    });
  }
  for (const i of estate.ideas) {
    if (!isIntakeIdea(i.status)) continue;
    rows.push({
      kind: "idea",
      id: i.id,
      code: null,
      name: i.title,
      portfolio: i.suggestedPortfolio,
      stage: "Intake",
      inactiveReason: null,
      health: null,
      sponsor: i.sponsor,
      priority: null,
      // An idea enters Intake when it is submitted.
      stageEnteredAt: i.createdAt.toISOString(),
    });
  }

  let history: StageHistory = { ready: false, weekAgo: null };
  if (estate.ready) {
    const counts = Object.fromEntries(CARD_STAGES.map((s) => [s, 0])) as Record<CardStage, number>;
    for (const s of estate.snaps) {
      // Same Shelved overlay as today, with the project's current portfolio category.
      const stage = overlayShelved(s.stage ?? "", categoryById.get(s.projectId) ?? null);
      if (stage !== "Inactive") counts[stage] += 1;
    }
    // Intake a week ago, rebuilt from the Idea table: submitted by then and not yet decided.
    counts.Intake = estate.ideas.filter(
      (i) => i.createdAt <= weekAgo && (OPEN_IDEAS.includes(i.status) || (i.triagedAt !== null && i.triagedAt > weekAgo)),
    ).length;
    history = { ready: true, weekAgo: counts };
  }

  return { rows, history };
}
