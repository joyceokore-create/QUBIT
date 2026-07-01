import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { listAuditLog } from "@/server/audit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/layout/breadcrumb";

export default async function AdminAuditPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };
  const rows = await listAuditLog(ctx);

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Audit log" }]} />

      <div>
        <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
          Audit log
        </h1>
        <p className="mt-[3px] text-xs text-ink-3">Latest {rows.length} events in this organization.</p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-ink-2">
                  {format(row.createdAt, "MMM d, yyyy HH:mm")}
                </TableCell>
                <TableCell className="text-ink-2">{row.actorName ?? row.actorId ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.action}</Badge>
                </TableCell>
                <TableCell className="text-ink-3">
                  {row.entityType}:{row.entityId}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-ink-3">
                  No audit events yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
