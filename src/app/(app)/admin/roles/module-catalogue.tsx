import { primaryRoleLabel } from "@/lib/rbac";
import { Panel } from "@/components/ui/panel";
import { Chip } from "@/components/ui/status-pill";

interface ModuleView {
  code: string;
  name: string;
  description: string | null;
  allowedRoles: string[];
  permissions: { code: string; actionName: string }[];
}

/**
 * Read-only browse of the global app_module + permission registry. Seeded from
 * src/lib/catalogue.ts; each module lists the roles whose nav it gates and the permissions it
 * owns. Shown under the Roles & Permissions matrix as reference (design spec v2 panel).
 */
export function ModuleCatalogue({ modules }: { modules: ModuleView[] }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-[8px] py-1 text-[13px] font-semibold text-[var(--ds-brand-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)]">
        <span className="group-open:hidden">Show All Modules and Permissions</span>
        <span className="hidden group-open:inline">Hide Modules and Permissions</span>
      </summary>
      <Panel title="Modules and Permissions" className="mt-3">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {modules.map((m) => (
            <div key={m.code} className="rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-[var(--ds-ink)]">{m.name}</span>
                <span className="font-mono text-[10.5px] text-[var(--ds-ink3)]">{m.code}</span>
              </div>
              {m.description && <p className="mt-0.5 text-[12px] text-[var(--ds-ink3)]">{m.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">Roles:</span>
                {m.allowedRoles.map((r) => (
                  <Chip key={r} tone="info">{primaryRoleLabel([r])}</Chip>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {m.permissions.map((p) => (
                  <span key={p.code} title={p.code} className="rounded-[6px] bg-[var(--ds-surface2)] px-2 py-1 text-[12px] text-[var(--ds-ink2)]">
                    {p.actionName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </details>
  );
}
