import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { getIdeaBoard } from "@/server/ideas";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { IdeasClient } from "./ideas-client";

// M-P4a (docs/35 §1, docs/26 §5.4) — the front of the funnel. Submitting is universal
// (`idea:create` is in BASE: a good idea can come from anywhere); triage belongs to the
// Head, who accepts (→ the project wizard, pre-filled), parks with a reason, or
// merges into an existing project.
//
// UX5 (L1–L5): one table of ideas (capped at 200 by getIdeaBoard), loaded once and paged
// in the browser; "+ New idea" is the header's primary action.
export default async function IdeasPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "idea:create")) return <Forbidden />;

  const [board, portfolios, projects, timeZone] = await Promise.all([
    getIdeaBoard(ctx),
    withTenant(ctx, (tx) => tx.portfolio.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })),
    // Merge targets — only needed by a triager, so don't pay for the query otherwise.
    can(ctx, "idea:triage")
      ? withTenant(ctx, (tx) =>
          tx.project.findMany({
            where: { status: { notIn: ["Completed", "Cancelled"] } },
            select: { id: true, code: true, name: true },
            orderBy: { name: "asc" },
          }),
        )
      : Promise.resolve([]),
    getTenantTimeZone(ctx),
  ]);

  return (
    <IdeasClient
      tenantName={session.user.tenantName}
      timeZone={timeZone}
      initial={JSON.parse(JSON.stringify(board))}
      portfolios={portfolios}
      projects={projects}
    />
  );
}
