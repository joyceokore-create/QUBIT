import { NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/api-guard";
import { parseListParams } from "@/lib/list-state";
import { DECISION_TABS, DUE_FILTERS, parseDecisionTab, RaiseInput, type DueFilter } from "@/lib/decisions";
import { getDecisionsPage, raiseDecision } from "@/server/decision-requests";
import { getTenantTimeZone } from "@/server/preferences";
import { engineError, invalid } from "./_respond";

// WS2 (Tier 4) — Decisions waiting on the Group.
// GET  ?tab=waiting|decided|actions&q=&page=&size=&project=&person=&due=  → one server page
//      (global read, like every project-shaped list: any tenant user; RLS scopes the tenant).
// POST → raise a decision. Session only at the route; the engine decides who may raise
//      (a Head: any project; a PM: their own — canWriteProject) and audits it.

export async function GET(req: Request) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const params = parseListParams(sp, { defaultSize: 10, filters: { tab: DECISION_TABS, project: "id", person: "id", due: DUE_FILTERS } });
  const tz = await getTenantTimeZone(guard.ctx);
  const data = await getDecisionsPage(
    guard.ctx,
    {
      tab: parseDecisionTab(params.filters.tab),
      q: params.q,
      page: params.page,
      size: params.size,
      projectId: params.filters.project,
      personId: params.filters.person,
      due: params.filters.due as DueFilter | undefined,
    },
    new Date(),
    tz,
  );
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = RaiseInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  try {
    return NextResponse.json({ data: await raiseDecision(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    return engineError(e);
  }
}
