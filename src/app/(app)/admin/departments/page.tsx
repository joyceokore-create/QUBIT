import { auth } from "@/lib/auth";
import { listDepartments, listOrgUnitOptions } from "@/server/departments";
import { listUsers } from "@/server/users";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { NewDepartmentDialog } from "./new-department-dialog";
import { DepartmentRowActions } from "./department-row-actions";

export default async function AdminDepartmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };
  const [departments, orgUnits, users] = await Promise.all([
    listDepartments(ctx),
    listOrgUnitOptions(ctx),
    listUsers(ctx),
  ]);
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Departments" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
            Departments
          </h1>
          <p className="mt-[3px] text-xs text-ink-3">
            {departments.length} departments in this organization
          </p>
        </div>
        <NewDepartmentDialog departments={departments} orgUnits={orgUnits} users={users} />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Org Unit</TableHead>
              <TableHead>Head</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-ink-2">
                  {d.parentId ? (departmentById.get(d.parentId)?.name ?? "—") : "—"}
                </TableCell>
                <TableCell className="text-ink-2">{d.orgUnitName ?? "—"}</TableCell>
                <TableCell className="text-ink-2">{d.headUserName ?? "—"}</TableCell>
                <TableCell className="text-ink-2">{d.memberCount}</TableCell>
                <TableCell className="text-right">
                  <DepartmentRowActions department={d} departments={departments} orgUnits={orgUnits} users={users} />
                </TableCell>
              </TableRow>
            ))}
            {departments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-ink-3">
                  No departments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
