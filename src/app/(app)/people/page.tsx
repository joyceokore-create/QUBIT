import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listWorkload } from "@/server/resources";
import { Forbidden } from "@/components/forbidden";

// People & workload — everyone with their project allocations. Doubles as the data
// behind the Q copilot's per-resource report (MVP1 Phase B).
export default async function PeoplePage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:read")) return <Forbidden />;

  const people = await listWorkload(ctx);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 p-[26px]">
      <div>
        <h1 className="font-heading text-[21px] rv:text-heading-md font-bold tracking-[-0.5px] text-foreground">People</h1>
        <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">{people.length} people · resource allocation across projects</p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-4 text-left text-[11px] rv:text-overline font-bold uppercase tracking-[.5px] text-ink-3">
              <th className="px-4 py-2.5 font-bold">Person</th>
              <th className="px-4 py-2.5 font-bold">Department</th>
              <th className="px-4 py-2.5 font-bold">Projects</th>
              <th className="px-4 py-2.5 font-bold">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.userId} className="border-b border-[var(--w05)] align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{p.name}</div>
                  <div className="text-xs text-ink-3">{p.email}</div>
                </td>
                <td className="px-4 py-3 text-ink-2">{p.departmentName ?? "—"}</td>
                <td className="px-4 py-3">
                  {p.allocations.length === 0 ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {p.allocations.map((a) => (
                        <span key={a.projectCode} className="rounded-full bg-background px-2.5 py-0.5 text-[11px] text-ink-2" title={`${a.role}${a.allocationPct != null ? ` · ${a.allocationPct}%` : ""}`}>
                          {a.projectName} · {a.role}
                          {a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="font-semibold"
                    style={{ color: p.totalPct > 100 ? "var(--bad)" : "var(--ink2)" }}
                    title={p.totalPct > 100 ? "Over-allocated" : undefined}
                  >
                    {p.totalPct}%
                  </span>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                  No people yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
