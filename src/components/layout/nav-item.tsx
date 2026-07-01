"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Briefcase,
  ClipboardList,
  KeyRound,
  LayoutGrid,
  Server,
  Shield,
  Target,
  Users,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icons are resolved here, inside the client component, and Sidebar (a server component)
// only ever passes the string key below — a bare component reference (even wrapped in an
// unrendered <Icon /> element) isn't serializable across the server→client boundary.
const ICONS = {
  "layout-grid": LayoutGrid,
  briefcase: Briefcase,
  shield: Shield,
  server: Server,
  users: Users,
  target: Target,
  "alert-triangle": AlertTriangle,
  "users-round": UsersRound,
  "key-round": KeyRound,
  "clipboard-list": ClipboardList,
} as const;

export type NavIconName = keyof typeof ICONS;

interface NavItemProps {
  href: string;
  icon?: NavIconName;
  count?: number;
  badge?: number;
  children: React.ReactNode;
}

export function NavItem({ href, icon, count, badge, children }: NavItemProps) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  const Icon = icon ? ICONS[icon] : null;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-[6px] px-2 py-[7px] text-xs font-medium text-ink-2 transition-colors",
        "hover:bg-background hover:text-foreground",
        active && "bg-brand-light font-semibold text-brand hover:bg-brand-light hover:text-brand",
      )}
    >
      {Icon && (
        <Icon
          className={cn("h-[15px] w-[15px] shrink-0 opacity-55", active && "opacity-100")}
        />
      )}
      <span className="truncate">{children}</span>
      {typeof count === "number" && (
        <span className="ml-auto shrink-0 text-[10px] text-ink-3">{count}</span>
      )}
      {typeof badge === "number" && badge > 0 && (
        <span className="ml-auto shrink-0 rounded-full bg-status-red px-[5px] py-px text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
