import { auth } from "@/lib/auth";
import { listUsers } from "@/server/users";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { NewUserDialog } from "./new-user-dialog";
import { UserRowActions } from "./user-row-actions";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };
  const users = await listUsers(ctx);

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Users" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
            Users
          </h1>
          <p className="mt-[3px] text-xs text-ink-3">{users.length} users in this organization</p>
        </div>
        <NewUserDialog />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-ink-2">{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "ACTIVE" ? "default" : "outline"}>{u.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <UserRowActions user={u} currentUserId={session.user.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
