import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listDepartments, listOrgUnitOptions } from "@/server/departments";
import { listUsers } from "@/server/users";
import { AdminHeader } from "../admin-header";
import { DepartmentDialog } from "./department-dialog";
import { DepartmentRowActions } from "./department-row-actions";
import { CARD, THEAD, TROW } from "@/lib/surface";

// UX fidelity D-F7: Heads see departments but may only edit the ones they head
// (canManageDepartment, src/lib/access.ts); creating needs departments:manage. Before this,
// "New Department" showed for Heads and the API refused it (403).
export default async function AdminDepartmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const canCreate = can(ctx, "departments:manage");
  const manageAll = ctx.roles.includes("PlatformSuperAdmin");
  const [departments, orgUnits, users] = await Promise.all([
    listDepartments(ctx),
    listOrgUnitOptions(ctx),
    listUsers(ctx),
  ]);
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_22px_90px]">
      <AdminHeader
        canManageIam={can(ctx, "iam:manage")}
        title="Departments"
        description={`${departments.length} ${departments.length === 1 ? "department" : "departments"}. Edit a department to change its head, parent or org unit.`}
        action={canCreate ? <DepartmentDialog mode="create" departments={departments} orgUnits={orgUnits} users={users} /> : undefined}
      />

      <TableCardStatic>
        {departments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-[var(--ds-ink)]">No departments yet</p>
            <p className="max-w-[48ch] text-[12.5px] text-[var(--ds-ink3)]">Departments are entered by hand. The hierarchy is checked for loops on every change, and the head field never grants a role.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Parent</th>
                <th scope="col">Org Unit</th>
                <th scope="col">Head</th>
                <th scope="col">Members</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className={TROW}>
                  <td>
                    <b className="font-semibold text-[var(--ds-ink)]">{d.name}</b>
                  </td>
                  <td className="text-[var(--ds-ink2)]">{d.parentId ? (departmentById.get(d.parentId)?.name ?? "None") : "None"}</td>
                  <td className="text-[var(--ds-ink2)]">{d.orgUnitName ?? "None"}</td>
                  <td className="text-[var(--ds-ink2)]">{d.headUserName ?? "None"}</td>
                  <td className="tabular-nums text-[var(--ds-ink2)]">{d.memberCount}</td>
                  <td className="text-right">
                    {(manageAll || d.headUserId === ctx.userId) && <DepartmentRowActions department={d} departments={departments} orgUnits={orgUnits} users={users} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCardStatic>
    </main>
  );
}

function TableCardStatic({ children }: { children: React.ReactNode }) {
  return (
    <section className={`${CARD} overflow-x-auto px-[18px] py-4`} style={{ background: "var(--ds-card)" }}>
      {children}
    </section>
  );
}
