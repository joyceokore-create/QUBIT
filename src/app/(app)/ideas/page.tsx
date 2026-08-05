import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { getIdeaBoard } from "@/server/ideas";
import { Forbidden } from "@/components/forbidden";
import { IdeasClient } from "./ideas-client";

// M-P4a (docs/35 §1, docs/26 §5.4) — the front of the funnel. Submitting is universal
// (`idea:create` is in BASE: a good idea can come from anywhere); triage belongs to the
// Head of PMs, who accepts (→ the project wizard, pre-filled), parks with a reason, or
// merges into an existing project.
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

  const [board, portfolios, projects] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
        Front of the funnel
      </div>
      <h1 className="text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">Idea intake &amp; triage</h1>
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        {board.canTriage
          ? "Where projects are born. Accept an idea and the project wizard opens pre-filled; park it and the reason stays on the record."
          : "Submit an idea — anyone can. The Head of PMs triages it, and you'll be told what was decided and why."}
      </p>
      <IdeasClient
        initial={JSON.parse(JSON.stringify(board))}
        portfolios={portfolios}
        projects={projects}
      />
    </div>
  );
}
