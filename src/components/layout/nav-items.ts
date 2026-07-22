import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  Users,
  Contact,
  BarChart3,
  Shield,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the primary app navigation — consumed by both the
 * topbar pills (nav-pills.tsx) and the Riverbank sidebar shell. `perm` gates an
 * item on a permission the viewer must hold; `icon` is used by the sidebar
 * (the topbar pills ignore it).
 */
export interface NavItem {
  label: string;
  href: string;
  perm?: "admin:access";
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Tasks", href: "/my-tasks", icon: ListChecks },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Teams", href: "/admin/teams", perm: "admin:access", icon: Users },
  { label: "People", href: "/people", icon: Contact },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Admin", href: "/admin", perm: "admin:access", icon: Shield },
];

/** Active when the path equals the href or sits under it (section root). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
