"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavPillsProps {
  /** Admin + Teams pills render only when the viewer holds `admin:access` (SuperAdmin + heads). */
  canAccessAdmin: boolean;
}

// MVP1 (Riverbank) nav: user & project management + reporting. The ClickUp
// Spaces/Tasks surfaces stay in the codebase but are out of the MVP nav.
const TABS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Tasks", href: "/my-tasks" },
  { label: "Projects", href: "/projects" },
  { label: "Teams", href: "/admin/teams", perm: "admin:access" as const },
  { label: "People", href: "/people" },
  { label: "Reports", href: "/reports" },
  { label: "Admin", href: "/admin", perm: "admin:access" as const },
];

export function NavPills({ canAccessAdmin }: NavPillsProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 gap-1">
      {TABS.filter((t) => t.perm !== "admin:access" || canAccessAdmin).map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-[var(--tbactivebg)] px-[15px] py-2 text-[13px] font-semibold text-[var(--tbactivec)] transition-colors"
                : "rounded-full px-[15px] py-2 text-[13px] font-semibold text-[var(--tbink)] transition-colors hover:text-[var(--tbinkS)]"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
