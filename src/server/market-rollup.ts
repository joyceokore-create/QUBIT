import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { CheckInError, getCurrentCheckIn, saveCheckInDraft, type CheckInView } from "@/server/checkins";
import type { Rag } from "@/server/health";
import { worstRag } from "@/server/rollout";

/**
 * docs/38 — a product reported per market (Swipe: a check-in per market every week) still
 * owes the Head ONE product line. This composes it from this week's market check-ins:
 * the worst market RAG, and one clause per market ("KE: live on all channels · RW: UAT
 * blocked on TMS"), trimmed to the 500 characters a check-in holds. It is a DRAFT the PM
 * edits and sends — never sent on its own — and it leaves a sent week alone (the editor
 * prefills instead, for Edit & resend).
 */

export const NARRATIVE_MAX = 500;

export interface MarketComposition {
  narrative: string;
  rag: Rag;
  markets: { orgUnitId: string; code: string; name: string; flag: string | null; rag: Rag; line: string }[];
  /** Live markets with no check-in this week (their codes). */
  missing: string[];
  isoWeek: string;
}

/** The first sentence, or the first `max` characters, of a market's narrative. */
function clause(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  const first = t.match(/^(.{20,}?[.!?])(\s|$)/)?.[1] ?? t;
  const pick = first.length <= max ? first : t.slice(0, max - 1).trimEnd() + "…";
  return pick.replace(/[.;]\s*$/, "");
}

export async function composeFromMarkets(ctx: TenantContext, projectId: string, now = new Date()): Promise<MarketComposition | null> {
  const isoWeek = isoWeekId(now);
  return withTenant(ctx, async (tx) => {
    const [live, checkIns] = await Promise.all([
      tx.projectOrgStatus.findMany({ where: { projectId, retiredAt: null }, select: { orgUnitId: true, orgUnit: { select: { code: true, name: true, flag: true } } }, orderBy: { orgUnit: { code: "asc" } } }),
      tx.marketCheckIn.findMany({ where: { projectId, isoWeek }, select: { orgUnitId: true, narrative: true, rag: true } }),
    ]);
    if (live.length === 0) return null;
    const byUnit = new Map(checkIns.map((c) => [c.orgUnitId, c]));
    const checked = live.filter((m) => byUnit.has(m.orgUnitId));
    if (checked.length === 0) return { narrative: "", rag: "Green", markets: [], missing: live.map((m) => m.orgUnit.code), isoWeek };
    // Each market gets an equal share of the line; a short note leaves room for the rest.
    const prefix = (code: string) => `${code}: `;
    const budget = Math.max(60, Math.floor((NARRATIVE_MAX - checked.length * 3) / checked.length) - 4);
    const markets = checked.map((m) => {
      const c = byUnit.get(m.orgUnitId)!;
      return { orgUnitId: m.orgUnitId, code: m.orgUnit.code, name: m.orgUnit.name, flag: m.orgUnit.flag, rag: c.rag as Rag, line: clause(c.narrative, budget) };
    });
    // Worst first, so the line opens with what needs attention.
    const rank: Record<Rag, number> = { Red: 0, Amber: 1, Green: 2 };
    markets.sort((a, b) => rank[a.rag] - rank[b.rag] || a.code.localeCompare(b.code));
    let narrative = markets.map((m) => `${prefix(m.code)}${m.line}`).join(" · ");
    if (narrative.length > NARRATIVE_MAX) narrative = narrative.slice(0, NARRATIVE_MAX - 1).trimEnd() + "…";
    return { narrative, rag: worstRag(markets.map((m) => m.rag)), markets, missing: live.filter((m) => !byUnit.has(m.orgUnitId)).map((m) => m.orgUnit.code), isoWeek };
  });
}

export interface DraftFromMarketsResult extends MarketComposition {
  /** The draft was saved (this week not sent yet); false = sent already, prefill only. */
  saved: boolean;
  view: CheckInView | null;
}

export async function draftFromMarkets(ctx: TenantContext, projectId: string, now = new Date()): Promise<DraftFromMarketsResult> {
  const composition = await composeFromMarkets(ctx, projectId, now);
  if (!composition) throw new CheckInError("This project has no markets — write the line yourself.", "NOT_CONFIRMED");
  if (composition.markets.length === 0) throw new CheckInError(`No market has checked in this week yet (${composition.missing.join(", ")}).`, "NOT_CONFIRMED");
  const current = await getCurrentCheckIn(ctx, projectId, now);
  if (current.status === "Confirmed") return { ...composition, saved: false, view: null };
  const reason = `Worst of ${composition.markets.length} market check-in${composition.markets.length === 1 ? "" : "s"}: ${composition.markets.map((m) => `${m.code} ${m.rag}`).join(", ")}`.slice(0, 300);
  const view = await saveCheckInDraft(
    ctx,
    projectId,
    { narrative: composition.narrative, ...(composition.rag !== current.computedRag ? { ragOverride: composition.rag, overrideReason: reason } : { ragOverride: null, overrideReason: null }) },
    now,
  );
  return { ...composition, saved: true, view };
}
