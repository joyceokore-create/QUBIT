"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, visibleNavItems } from "./nav-items";

interface NavPillsProps {
  /** Admin + Teams pills render only when the viewer holds `admin:access` (SuperAdmin + heads). */
  canAccessAdmin: boolean;
  canStaff: boolean;
  /** docs/32 §0.3 — member-only viewers get the slim nav. */
  memberOnly: boolean;
}

export function NavPills({ canAccessAdmin, canStaff, memberOnly }: NavPillsProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 gap-1">
      {(() => {
        const items = visibleNavItems({ canAccessAdmin, canStaff, memberOnly });
        const activeHref = activeNavHref(pathname, items);
        return items.map((tab) => {
        const active = tab.href === activeHref;
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
        });
      })()}
    </nav>
  );
}
