import { PERMISSION_CATALOGUE, ROLE_PERMISSIONS } from "@/lib/rbac";
import { AdminHeader } from "../admin-header";

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export default function AdminRolesPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader subtitle="Built-in roles are fixed in code (docs/07-auth-rbac.md) — custom role creation is deferred by spec." />

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        {Object.entries(ROLE_PERMISSIONS).map(([role, grants]) => (
          <div key={role} className={`${CARD} p-[14px_16px] transition-transform duration-200 hover:-translate-y-[2px]`} style={{ background: "var(--cardbg)" }}>
            <div className="mb-2.5 font-heading text-[13.5px] font-bold text-[var(--qink)]">{role}</div>
            <div className="flex flex-wrap gap-1.5">
              {grants.map((g) => (
                <span key={g} className="rounded-[5px] bg-[var(--wash2)] px-2 py-1 font-mono text-[9.5px] tracking-[.3px] text-[var(--ink3)]">{g}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-[16px_18px] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]`} style={{ background: "var(--cardbg)" }}>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Permission catalogue</span>
          <span className="font-mono text-[9.5px] tracking-[1.2px] text-[var(--ink4)]">FR-IAM-04 · FIXED IN CODE</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERMISSION_CATALOGUE.map((p) => (
            <span key={p} className="rounded-[5px] border border-[var(--hair)] px-2 py-1 font-mono text-[9.5px] tracking-[.3px] text-[var(--ink3)]">{p}</span>
          ))}
        </div>
      </div>
    </main>
  );
}
