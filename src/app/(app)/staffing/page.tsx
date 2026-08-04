import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { listResourceRequests } from "@/server/staffing";
import { Forbidden } from "@/components/forbidden";
import { StaffingClient } from "./staffing-client";

// M-P1d (docs/26 §4.3) — resource requests. A PM asks for a shape; the Head fills it
// from the bench. PMs see the requests they raised; the Head sees the whole queue.
export default async function StaffingPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  // The staffing actors: anyone who can create projects (PMs, Heads) or fill requests.
  if (!can(ctx, "project:create") && !can(ctx, "staffing:manage")) return <Forbidden />;

  const isHead = can(ctx, "staffing:manage");
  const [requests, myProjects] = await Promise.all([
    listResourceRequests(ctx),
    withTenant(ctx, (tx) =>
      tx.project.findMany({
        where: isHead
          ? {}
          : {
              OR: [
                { leadUserId: ctx.userId },
                { members: { some: { userId: ctx.userId, role: "Project Manager" } } },
              ],
            },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
      <h1 className="text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">Resource requests</h1>
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        {isHead
          ? "Fill requests from the bench — you own it."
          : "Ask for a shape (“1 QA · 60% · Aug–Sep”); the Head fills it from the bench."}
      </p>
      <StaffingClient
        isHead={isHead}
        projects={myProjects}
        requests={requests.map((r) => ({
          ...r,
          windowStart: r.windowStart.toISOString(),
          windowEnd: r.windowEnd.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
