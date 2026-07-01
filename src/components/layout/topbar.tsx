import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { TenantChip } from "@/components/layout/tenant-chip";
import { UserMenu } from "@/components/layout/user-menu";

const NAV_TABS = [
  { label: "Dashboard", href: "/dashboard", enabled: true },
  { label: "Executive View", href: "/dashboard", enabled: false },
  { label: "My Tasks", href: "/tasks", enabled: false },
  { label: "Reports", href: "/reports", enabled: false },
];

export async function Topbar() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
  };

  return (
    <header className="sticky top-0 z-50 flex h-[54px] shrink-0 items-center gap-5 border-b border-ink-4 bg-white px-6">
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2 font-heading text-base font-extrabold tracking-[-0.5px] text-foreground"
      >
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-brand">
          <LayoutGrid className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </span>
        QUBIT
      </Link>

      <div className="h-[22px] w-px shrink-0 bg-ink-4" />

      <nav className="flex gap-0.5">
        {NAV_TABS.map((tab) =>
          tab.enabled ? (
            <Link
              key={tab.label}
              href={tab.href}
              className="rounded-[6px] bg-brand-light px-[11px] py-[5px] text-xs font-semibold text-brand"
            >
              {tab.label}
            </Link>
          ) : (
            <span
              key={tab.label}
              title="Coming soon"
              className="cursor-not-allowed rounded-[6px] px-[11px] py-[5px] text-xs font-medium text-ink-3 opacity-50"
            >
              {tab.label}
            </span>
          ),
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <TenantChip
          tenantName={session.user.tenantName}
          canSwitch={can(ctx, "tenant:switch")}
        />
        <UserMenu name={session.user.name ?? ""} email={session.user.email ?? ""} />
      </div>
    </header>
  );
}
