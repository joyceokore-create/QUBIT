import { auth } from "@/lib/auth";
import { listDepartments, listOrgUnitOptions } from "@/server/departments";
import { listUsers } from "@/server/users";
import { AdminHeader } from "../admin-header";
import { DepartmentDialog } from "./department-dialog";
import { DepartmentRowActions } from "./department-row-actions";
import { CARD_GLASS as CARD } from "@/lib/surface";

const ROW = "grid grid-cols-[minmax(0,1.4fr)_140px_140px_140px_70px_40px] items-center gap-3.5 p-[10px_18px]";

export default async function AdminDepartmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const [departments, orgUnits, users] = await Promise.all([
    listDepartments(ctx),
    listOrgUnitOptions(ctx),
    listUsers(ctx),
  ]);
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        subtitle={`${departments.length} ${departments.length === 1 ? "department" : "departments"} · org structure ships empty by design (no seeded PII)`}
        action={<DepartmentDialog mode="create" departments={departments} orgUnits={orgUnits} users={users} />}
      />

      {departments.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[var(--hair)] p-10 text-center [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
          <span aria-hidden className="grid grid-cols-2 grid-rows-2 gap-1 opacity-35">
            <span className="size-3.5 rounded-[4px] bg-[var(--ink4)]" />
            <span className="size-3.5 rounded-[4px]" style={{ background: "color-mix(in oklab, var(--ink4) 45%, transparent)" }} />
            <span className="size-3.5 rounded-[4px]" style={{ background: "color-mix(in oklab, var(--ink4) 45%, transparent)" }} />
            <span className="size-3.5 rounded-[4px] bg-[var(--ink4)]" />
          </span>
          <div className="text-[13px] font-semibold text-[var(--qink)]">No departments yet</div>
          <p className="max-w-[380px] text-[12px] rv:text-body-sm leading-[1.55] text-[var(--ink4)]">
            Real departments are entered by hand — the hierarchy is cycle-checked on every update, and the head field is
            informational (it never grants the DepartmentHead role).
          </p>
        </div>
      ) : (
        <div className={`overflow-hidden [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both] ${CARD}`} style={{ background: "var(--cardbg)" }}>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${ROW} border-b border-[var(--hair)] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
                <span>Name</span><span>Parent</span><span>Org unit</span><span>Head</span><span>Members</span><span className="text-right">·</span>
              </div>
              {departments.map((d) => (
                <div key={d.id} className={`${ROW} border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
                  <span className="truncate text-[13px] font-semibold text-[var(--qink)]">{d.name}</span>
                  <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{d.parentId ? (departmentById.get(d.parentId)?.name ?? "—") : "—"}</span>
                  <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{d.orgUnitName ?? "—"}</span>
                  <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{d.headUserName ?? "—"}</span>
                  <span className="font-mono rv:font-data text-[11px] rv:text-data-sm text-[var(--ink4)]">{d.memberCount}</span>
                  <span className="flex justify-end">
                    <DepartmentRowActions department={d} departments={departments} orgUnits={orgUnits} users={users} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
