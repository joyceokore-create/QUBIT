import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { parseListParams } from "@/lib/list-state";
import { canCreateGlcAction, canDecide, DECISION_TABS, DUE_FILTERS, isExecutive, isHead, parseDecisionTab, type DueFilter } from "@/lib/decisions";
import { Forbidden } from "@/components/forbidden";
import { getDecisionRequest, getDecisionsPage, glcOwnerOptions, raiseableProjects } from "@/server/decision-requests";
import { getTenantTimeZone } from "@/server/preferences";
import { DecisionsClient } from "./decisions-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// WS2 (UX fidelity Tier 4) — Decisions: tabs Waiting · Decided · GLC Actions, search, Project /
// Raised By (Owner on GLC Actions) / Due filters, a row list and the pager; drawer 15 "Record a
// Decision" for Executives. Paged, searched and filtered on the server (L4) under the viewer's
// tenant RLS. Global read like every project-shaped list; who may raise, decide and act is
// decided by the engine (src/server/decision-requests.ts) and only reflected here.
export default async function DecisionsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "project:read")) return <Forbidden />;

  const sp = await searchParams;
  const params = parseListParams(sp, { defaultSize: 10, filters: { tab: DECISION_TABS, project: "id", person: "id", due: DUE_FILTERS, open: "id", raise: "id" } });
  const tab = parseDecisionTab(params.filters.tab);
  const now = new Date();
  const tz = await getTenantTimeZone(ctx);
  const mayAct = canCreateGlcAction(ctx.roles);
  const [data, openRow, raiseProjects, owners, allProjects] = await Promise.all([
    getDecisionsPage(ctx, { tab, q: params.q, page: params.page, size: params.size, projectId: params.filters.project, personId: params.filters.person, due: params.filters.due as DueFilter | undefined }, now, tz),
    params.filters.open ? getDecisionRequest(ctx, params.filters.open) : Promise.resolve(null),
    raiseableProjects(ctx),
    mayAct ? glcOwnerOptions(ctx) : Promise.resolve([]),
    // The GLC action form may name any active project (an Executive leads none of them).
    mayAct
      ? withTenant(ctx, (tx) => tx.project.findMany({ where: { status: { notIn: ["Completed", "Cancelled"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }))
      : Promise.resolve([]),
  ]);
  // A Head may raise for any project (or none); anyone else needs a project they run.
  const mayRaise = isHead(ctx.roles) || raiseProjects.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_22px_90px]">
      <DecisionsClient
        tab={tab}
        data={data}
        openRow={openRow}
        viewer={{
          id: ctx.userId,
          roles: ctx.roles,
          mayRaise,
          mayDecide: canDecide(ctx.roles),
          mayCreateAction: mayAct,
          headLevel: isHead(ctx.roles),
          executive: isExecutive(ctx.roles),
        }}
        raiseProjects={raiseProjects}
        allProjects={allProjects}
        owners={owners}
        // "?raise=1" opens the Raise drawer; "?raise=<projectId>" (a Head's hint) prefills the project.
        startRaise={!!params.filters.raise && mayRaise}
        raiseProjectId={raiseProjects.some((p) => p.id === params.filters.raise) ? (params.filters.raise ?? null) : null}
        timeZone={tz}
        nowIso={now.toISOString()}
      />
    </main>
  );
}
