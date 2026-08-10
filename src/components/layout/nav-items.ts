import {
  LayoutDashboard,
  ListChecks,
  Briefcase,
  FolderKanban,
  Lightbulb,
  TriangleAlert,
  Contact,
  BarChart3,
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
  // DM1.73 — Ideas is memberHidden: docs/32 §0.3 keeps a member's nav to Dashboard ·
  // My Board · Projects · Reports. `idea:create` stays in BASE, so the intake form
  // remains reachable for members via direct link — it just isn't a nav pill.
  { label: "Ideas", href: "/ideas", memberHidden: true, icon: Lightbulb }, // M-P4a — intake is for everyone
  { label: "Portfolios", href: "/portfolios", memberHidden: true, icon: Briefcase }, // M-P1b (docs/25 W1)
  // DM1.73 — Programmes merged into Portfolios: every programme card linked to its
  // parent portfolio anyway; programmes are managed from the portfolio detail page.
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Risks", href: "/risks", memberHidden: true, icon: TriangleAlert },
  // DM1.73 — Staffing merged into People (?tab=requests); the People page gates the
  // requests tab on project:create, so PMs (not memberOnly) still reach it.
  { label: "People", href: "/people", memberHidden: true, icon: Contact },
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

/** DM1.73 (T6) — exactly ONE nav item is active: the longest matching href. Prefix
 * matching alone lit two pills at once for nested sections (e.g. /admin/teams). */
export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null;
  for (const n of items) {
    if (isNavActive(pathname, n.href) && (best === null || n.href.length > best.length)) best = n.href;
  }
  return best;
}
