import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { can } from "@/lib/rbac";
import { getCurrentCheckIn } from "@/server/checkins";
import type { Rag } from "@/server/health";

/**
 * "My week" (docs/38 rethink) — the cross-project weekly ritual in one place. A PM
 * confirms every project they run from a single queue instead of visiting each
 * workspace; the weekly confirm IS the status update (RAG + narrative in one act).
 * Heads/Execs get the same queue as a read-side over the estate — silence is visible.
 *
 * Each row carries the current week's check-in view (persisted row, or the computed
 * auto-draft when none exists yet), so the queue shows a ready-to-confirm draft per
 * project — reporting becomes review, not writing.
 */

export interface MyWeekRow {
  projectId: string;
  code: string;
  name: string;
  portfolioName: string;
  status: "Draft" | "Confirmed";
  computedRag: Rag;
  effectiveRag: Rag;
  /** The PM's confirmed narrative, once confirmed. */
  narrative: string | null;
  /** Auto-draft bullet lines — the evidence to confirm against. */
  draftLines: string[];
  confirmed: boolean;
  sentToHead: boolean;
  /** Whether THIS viewer may confirm/send this project's report. */
  canConfirm: boolean;
}

export interface MyWeek {
  isoWeek: string;
  scope: "owned" | "oversight";
  rows: MyWeekRow[];
}

const ACTIVE = { notIn: ["Completed", "Cancelled"] };
const OVERSIGHT_CAP = 40;

/** The viewer's week: the projects they run (lead or PM member), or — when they run
 * none but hold oversight (Head/Exec/SuperAdmin) — the active estate as a read-side. */
export async function getMyWeek(ctx: TenantContext, now = new Date()): Promise<MyWeek> {
  const isoWeek = isoWeekId(now);
  const canWriteAll = can(ctx, "project:write"); // heads / superadmin
  const oversight = canWriteAll || can(ctx, "reports:read");

  const picked = await withTenant(ctx, async (tx) => {
    const owned = await tx.project.findMany({
      where: {
        status: ACTIVE,
        OR: [{ leadUserId: ctx.userId }, { members: { some: { userId: ctx.userId, role: "Project Manager" } } }],
      },
      select: { id: true, code: true, name: true, portfolio: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    if (owned.length) return { list: owned, scope: "owned" as const };
    if (oversight) {
      const all = await tx.project.findMany({
        where: { status: ACTIVE },
        select: { id: true, code: true, name: true, portfolio: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: OVERSIGHT_CAP,
      });
      return { list: all, scope: "oversight" as const };
    }
    return { list: [], scope: "owned" as const };
  });

  const rows: MyWeekRow[] = [];
  for (const p of picked.list) {
    const v = await getCurrentCheckIn(ctx, p.id, now);
    rows.push({
      projectId: p.id,
      code: p.code,
      name: p.name,
      portfolioName: p.portfolio?.name ?? "Unassigned",
      status: v.status,
      computedRag: v.computedRag,
      effectiveRag: v.effectiveRag,
      narrative: v.narrative,
      draftLines: v.lines,
      confirmed: v.status === "Confirmed",
      sentToHead: Boolean(v.submittedToHeadAt),
      canConfirm: canWriteAll || picked.scope === "owned",
    });
  }

  // Unconfirmed first (they need action), then not-yet-sent, then done; worst RAG first.
  const ragRank: Record<string, number> = { Red: 0, Amber: 1, Green: 2 };
  rows.sort((a, b) => {
    const stage = (r: MyWeekRow) => (!r.confirmed ? 0 : !r.sentToHead ? 1 : 2);
    return stage(a) - stage(b) || (ragRank[a.effectiveRag] ?? 3) - (ragRank[b.effectiveRag] ?? 3) || a.name.localeCompare(b.name);
  });

  return { isoWeek, scope: picked.scope, rows };
}
