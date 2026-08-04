import {
  LayoutDashboard,
  ListChecks,
  Briefcase,
  Boxes,
  FolderKanban,
  TriangleAlert,
  Clock,
  Users,
  Contact,
  BarChart3,
  UserPlus,
  Shield,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the primary app navigation — consumed by both the
 * topbar pills (nav-pills.tsx) and the Riverbank sidebar shell. `perm` gates an
 * item on a permission the viewer must hold; `memberHidden` drops it for viewers
 * whose personas are ONLY member categories (docs/32 §0.3 — a member's world is
 * their work, not the estate); `icon` is used by the sidebar only.
 */
export interface NavItem {
  label: string;
  href: string;
  perm?: "admin:access" | "project:create";
  /** Hidden when the viewer's persona groups are all member categories (dev/qa/impl). */
  memberHidden?: true;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Board", href: "/board", icon: ListChecks }, // docs/18 §4 — the daily surface
  { label: "Portfolios", href: "/portfolios", memberHidden: true, icon: Briefcase }, // M-P1b (docs/25 W1)
  { label: "Programmes", href: "/programmes", memberHidden: true, icon: Boxes }, // M-W1a (docs/32)
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Risks", href: "/risks", memberHidden: true, icon: TriangleAlert },
  { label: "Time", href: "/time", memberHidden: true, icon: Clock },
  { label: "Teams", href: "/admin/teams", perm: "admin:access", icon: Users },
  { label: "People", href: "/people", memberHidden: true, icon: Contact },
  { label: "Staffing", href: "/staffing", perm: "project:create", icon: UserPlus }, // M-P1d — resource requests
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Admin", href: "/admin", perm: "admin:access", icon: Shield },
];

export interface NavViewer {
  canAccessAdmin: boolean;
  canStaff: boolean;
  /** True when every persona group the viewer holds is a member category (docs/32 §0.3). */
  memberOnly: boolean;
}

/** The one nav filter (M-W1a) — both shells consume this, so they cannot drift. */
export function visibleNavItems(viewer: NavViewer): NavItem[] {
  return NAV_ITEMS.filter((n) => {
    if (n.perm === "admin:access" && !viewer.canAccessAdmin) return false;
    if (n.perm === "project:create" && !viewer.canStaff) return false;
    if (n.memberHidden && viewer.memberOnly) return false;
    return true;
  });
}

const MEMBER_GROUPS = new Set(["developer", "qa", "implementor"]);

/** docs/32 §0.3 — member-only when they hold at least one group and none beyond
 * dev/qa/implementor. An empty persona list is NOT member-only (fail open to the
 * full nav rather than hiding surfaces from an unclassified account). */
export function isMemberOnly(personas: readonly string[]): boolean {
  return personas.length > 0 && personas.every((p) => MEMBER_GROUPS.has(p));
}

/** Active when the path equals the href or sits under it (section root). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
