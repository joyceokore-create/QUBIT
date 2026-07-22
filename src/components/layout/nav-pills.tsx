"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "./nav-items";

interface NavPillsProps {
  /** Admin + Teams pills render only when the viewer holds `admin:access` (SuperAdmin + heads). */
  canAccessAdmin: boolean;
}

export function NavPills({ canAccessAdmin }: NavPillsProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 gap-1">
      {NAV_ITEMS.filter((t) => t.perm !== "admin:access" || canAccessAdmin).map((tab) => {
        const active = isNavActive(pathname, tab.href);
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
