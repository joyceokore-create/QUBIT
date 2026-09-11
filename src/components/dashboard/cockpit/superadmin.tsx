import type { CockpitData } from "@/server/dashboard-cockpit";
import { ExecCockpit } from "./exec";

export interface AdminStats {
  users: number;
  activeUsers: number;
  customRoles: number;
  modules: number;
}

// Super Admin = a slim platform-admin stat row (IAM + catalogue health from the RBAC work)
// above the decluttered Executive cockpit. The level switcher lets them inspect any level.
export function SuperadminCockpit({ data, stats }: { data: CockpitData; stats: AdminStats }) {
  const stat = (v: number, label: string) => (
    <span className="flex items-baseline gap-1.5">
      <b className="text-[15px] font-semibold text-[var(--qink)]">{v}</b>
      <span className="text-[12px] text-[var(--ink3)]">{label}</span>
    </span>
  );
  return (
    <div className="flex flex-col gap-5">
      {/* One slim admin row — not a second dashboard. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] border border-[var(--cardbd)] px-4 py-2.5" style={{ background: "var(--cardbg)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink4)]">Platform</span>
        {stat(stats.activeUsers, "active users")}
        {stat(stats.customRoles, "custom roles")}
        {stat(stats.modules, "app modules")}
        {stat(data.projects.length, "projects")}
        <span className="ml-auto flex gap-2 text-[12px]">
          <a href="/admin/users" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Users</a>
          <a href="/admin/roles" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Roles</a>
          <a href="/admin/audit" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Audit</a>
        </span>
      </div>

      <ExecCockpit data={data} />
    </div>
  );
}
