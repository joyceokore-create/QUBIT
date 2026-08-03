import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listWorkload } from "@/server/resources";
import { ExportButton } from "@/components/export-button";
import { Forbidden } from "@/components/forbidden";

// Same bespoke table treatment as the admin surfaces (Teams/Audit): elevated card
// + grid rows, uppercase overline header, divider rows.
const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW =
  "grid grid-cols-[minmax(0,1.4fr)_160px_minmax(0,1.8fr)_110px] items-start gap-3.5 p-[12px_18px]";

// People & workload — everyone with their project allocations. Doubles as the data
// behind the Q copilot's per-resource report (MVP1 Phase B).
export default async function PeoplePage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:read")) return <Forbidden />;

  const people = await listWorkload(ctx);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 p-[26px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] rv:text-heading-md font-bold tracking-[-0.5px] text-foreground">People</h1>
          <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">{people.length} people · resource allocation across projects</p>
        </div>
        <ExportButton href="/api/export?kind=allocations" />
      </div>

      <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className={`${ROW} items-center border-b border-[var(--hair)] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
              <span>Person</span>
              <span>Department</span>
              <span>Projects</span>
              <span className="justify-self-end">Allocation</span>
            </div>
            {people.map((p) => (
              <div key={p.userId} className={`${ROW} border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
                <div className="min-w-0">
                  <div className="truncate text-[13px] rv:text-body-sm font-semibold text-[var(--qink)]">{p.name}</div>
                  <div className="truncate text-[11px] rv:text-body-xs text-[var(--ink4)]">{p.email}</div>
                </div>
                <span className="text-[12px] rv:text-body-sm text-[var(--ink3)]">{p.departmentName ?? "—"}</span>
                <div className="min-w-0">
                  {p.allocations.length === 0 ? (
                    <span className="text-[12px] text-[var(--ink4)]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {p.allocations.map((a) => (
                        <span key={a.projectCode} className="rounded-full bg-[var(--wash2)] px-2.5 py-0.5 text-[11px] rv:text-body-xs text-[var(--ink2)]" title={`${a.role}${a.allocationPct != null ? ` · ${a.allocationPct}%` : ""}`}>
                          {a.projectName} · {a.role}
                          {a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span
                  className="justify-self-end text-[13px] rv:text-body-sm font-semibold tabular-nums"
                  style={{ color: p.totalPct > 100 ? "var(--bad)" : "var(--ink2)" }}
                  title={p.totalPct > 100 ? "Over-allocated" : undefined}
                >
                  {p.totalPct}%
                </span>
              </div>
            ))}
            {people.length === 0 && (
              <div className="p-8 text-center text-[12px] rv:text-body-sm text-[var(--ink5)]">No people yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
