import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PERMISSION_CATALOGUE, ROLE_PERMISSIONS } from "@/lib/rbac";

export default function AdminRolesPage() {
  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Roles" }]} />

      <div>
        <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
          Roles &amp; permissions
        </h1>
        <p className="mt-[3px] text-xs text-ink-3">
          Built-in roles are fixed in code (docs/07-auth-rbac.md) — custom role creation is
          not yet available.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(ROLE_PERMISSIONS).map(([role, grants]) => (
          <div key={role} className="rounded-[10px] border border-ink-4 bg-white p-4">
            <div className="mb-2 font-heading text-sm font-semibold text-foreground">{role}</div>
            <div className="flex flex-wrap gap-1.5">
              {grants.map((grant) => (
                <Badge key={grant} variant="secondary">
                  {grant}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Permission catalogue</h2>
        <div className="flex flex-wrap gap-1.5">
          {PERMISSION_CATALOGUE.map((permission) => (
            <Badge key={permission} variant="outline">
              {permission}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
