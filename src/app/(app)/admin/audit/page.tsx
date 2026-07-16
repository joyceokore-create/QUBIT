import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { listAuditLog } from "@/server/audit";
import { AdminHeader } from "../admin-header";

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW = "grid grid-cols-[130px_160px_140px_minmax(0,1fr)] items-center gap-3.5 p-[9px_18px]";

export default async function AdminAuditPage() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles };
  const rows = await listAuditLog(ctx);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader subtitle={`Latest ${rows.length} ${rows.length === 1 ? "event" : "events"} · every mutation writes a row, atomic with the change`} />

      <div className={`overflow-hidden [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both] ${CARD}`} style={{ background: "var(--cardbg)" }}>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${ROW} border-b border-[var(--hair)] font-mono text-[9px] font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
              <span>When</span><span>Actor</span><span>Action</span><span>Entity</span>
            </div>
            {rows.map((row) => (
              <div key={row.id} className={`${ROW} border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
                <span className="font-mono text-[10px] text-[var(--ink4)]">{format(row.createdAt, "MMM d HH:mm")}</span>
                <span className="truncate text-[12px] font-medium text-[var(--ink2)]">{row.actorName ?? row.actorId ?? "—"}</span>
                <span className="justify-self-start rounded-[5px] bg-[var(--wash2)] px-2 py-[3px] font-mono text-[9px] font-semibold tracking-[.6px] text-[var(--ink3)]">{row.action}</span>
                <span className="truncate font-mono text-[10px] text-[var(--ink4)]">{row.entityType}:{row.entityId}</span>
              </div>
            ))}
            {rows.length === 0 && <div className="p-8 text-center text-[12px] text-[var(--ink5)]">No audit events yet.</div>}
          </div>
        </div>
      </div>
    </main>
  );
}
