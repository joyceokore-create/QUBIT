import { primaryRoleLabel } from "@/lib/rbac";

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

interface ModuleView {
  code: string;
  name: string;
  description: string | null;
  allowedRoles: string[];
  permissions: { code: string; actionName: string }[];
}

/**
 * Read-only browse of the global app_module + permission registry (tuma's App Modules /
 * Permissions views). Seeded from src/lib/catalogue.ts; each module lists the roles whose
 * nav it gates and the permissions it owns.
 */
export function ModuleCatalogue({ modules }: { modules: ModuleView[] }) {
  return (
    <div
      className={`${CARD} p-[16px_18px] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]`}
      style={{ background: "var(--cardbg)" }}
    >
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="font-heading text-[13.5px] rv:text-heading-xs font-bold text-[var(--qink)]">
          App modules & permissions
        </span>
        <span className="font-mono rv:font-sans text-[9.5px] rv:text-overline tracking-[1.2px] text-[var(--ink4)]">
          FR-IAM-04 · registry
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {modules.map((m) => (
          <div key={m.code} className="rounded-[12px] border border-[var(--hair)] p-[12px_14px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-[12.5px] font-bold text-[var(--qink)]">{m.name}</span>
              <span className="font-mono text-[8.5px] uppercase tracking-[1px] text-[var(--ink4)]">{m.code}</span>
            </div>
            {m.description && <p className="mt-0.5 text-[11px] text-[var(--ink3)]">{m.description}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-[9.5px] uppercase tracking-[1px] text-[var(--ink4)]">Roles:</span>
              {m.allowedRoles.map((r) => (
                <span key={r} className="rounded-[5px] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] px-1.5 py-0.5 text-[9.5px] font-semibold text-brand">
                  {primaryRoleLabel([r])}
                </span>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {m.permissions.map((p) => (
                <span
                  key={p.code}
                  title={p.code}
                  className="rounded-[5px] bg-[var(--wash2)] px-2 py-1 text-[10.5px] tracking-[.2px] text-[var(--ink3)]"
                >
                  {p.actionName}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
