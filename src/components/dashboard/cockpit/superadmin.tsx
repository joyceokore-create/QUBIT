import type { CockpitData } from "@/server/dashboard-cockpit";
import { Tile } from "./primitives";
import { ExecCockpit } from "./exec";

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;

export interface AdminStats {
  users: number;
  activeUsers: number;
  customRoles: number;
  modules: number;
}

// Super Admin = the Executive cockpit plus a platform-admin strip (IAM + catalogue health
// from the RBAC work). The level switcher (in CockpitInteractive) lets them inspect any level.
export function SuperadminCockpit({ data, stats }: { data: CockpitData; stats: AdminStats }) {
  return (
    <div className="flex flex-col gap-5">
      <section className={CARD} style={cardStyle}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--qink)]">Platform administration</h2>
          <div className="flex gap-2 text-[12px]">
            <a href="/admin/users" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Users</a>
            <a href="/admin/roles" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Roles</a>
            <a href="/admin/audit" className="rounded bg-[var(--wash2)] px-2 py-1 font-semibold text-[var(--ink2)]">Audit</a>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Tile value={stats.activeUsers} label="Active users" detail={`${stats.users} total`} />
          <Tile value={stats.customRoles} label="Custom roles" detail="beyond the six built-in" />
          <Tile value={stats.modules} label="App modules" detail="permission catalogue" />
          <Tile value={data.projects.length} label="Projects" detail="across the tenant" />
        </div>
      </section>

      <ExecCockpit data={data} />
    </div>
  );
}
