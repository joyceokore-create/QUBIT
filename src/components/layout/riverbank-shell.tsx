"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LayoutGrid,
  Folder,
  ListChecks,
  TriangleAlert,
  CalendarCheck,
  ArrowLeftRight,
  Shield,
  Globe,
  BarChart3,
  Circle,
  Home,
  Inbox,
  Layers,
  Lightbulb,
  Users,
  SlidersHorizontal,
  User,
  KeyRound,
  Building2,
  Compass,
  History,
  type LucideIcon,
} from "lucide-react";
import { activeMenuKey, type MenuGroup, type MenuIcon } from "@/lib/role-menus";
import { APPROVALS_CHANGED } from "@/lib/approvals";
import type { UiMode } from "@/lib/ui-mode";
import type { ViewRole } from "@/lib/view-roles";
import { ViewingAs } from "./viewing-as";
import { CommandPalette } from "./command-palette";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getInitials } from "@/lib/format";
import { jumpToSection, useCockpitSections } from "@/components/dashboard/cockpit/section-nav";
import { activeNavHref, visibleNavItems } from "./nav-items";
import { UserMenu } from "./user-menu";
import { SetupNudge } from "@/components/tour/setup-nudge";
import { AskQButton } from "./ask-q-button";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface RiverbankShellProps {
  canAccessAdmin: boolean;
  canStaff: boolean;
  memberOnly: boolean;
  roles?: readonly string[];
  moduleAllowedRoles?: Record<string, readonly string[]>;
  canSwitchTenant: boolean;
  tenants: { slug: string; name: string }[];
  tenantSlug: string;
  tenantName: string;
  userName: string;
  userEmail: string;
  userRole: string;
  /** UX3: the person's layout (D11). "new" draws the role menu below. */
  uiMode?: UiMode;
  /** UX3 (D2a/D6): present when uiMode is "new" — the role's grouped menu and the switch. */
  newNav?: {
    groups: MenuGroup[];
    viewRole: ViewRole;
    options: ViewRole[];
    showSwitch: boolean;
    superAdmin: boolean;
  };
  children: React.ReactNode;
}

/** Role-menu icon names → lucide (UX3). */
const MENU_ICONS: Record<MenuIcon, LucideIcon> = {
  home: Home,
  board: ListChecks,
  inbox: Inbox,
  layers: Layers,
  folder: Folder,
  bulb: Lightbulb,
  alert: TriangleAlert,
  users: Users,
  chart: BarChart3,
  shield: Shield,
  filter: SlidersHorizontal,
  user: User,
  key: KeyRound,
  building: Building2,
  compass: Compass,
  history: History,
};

const SIDEBAR_KEY = "rv-sidebar-open";

/** Cockpit section icon names (pm-v3 ICONS keys) → the sidebar's lucide set. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  grid: LayoutGrid,
  folder: Folder,
  list: ListChecks,
  warn: TriangleAlert,
  calcheck: CalendarCheck,
  compare: ArrowLeftRight,
  shield: Shield,
  globe: Globe,
  report: BarChart3,
};

export function RiverbankShell({
  canAccessAdmin,
  canStaff,
  memberOnly,
  roles,
  moduleAllowedRoles,
  canSwitchTenant,
  tenants,
  tenantSlug,
  tenantName,
  userName,
  userEmail,
  userRole,
  uiMode = "classic",
  newNav,
  children,
}: RiverbankShellProps) {
  const pathname = usePathname();
  // Default expanded; sync the persisted preference after mount (SSR-safe).
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Cockpit sections (published by the mounted dashboard view) render as a
  // dropdown under the Dashboard item; empty on every other route.
  const { sections, active: activeSection } = useCockpitSections();
  const [dashOpen, setDashOpen] = useState(true);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    if (saved === "0") setOpen(false);
  }, []);

  function toggleSidebar() {
    setOpen((o) => {
      window.localStorage.setItem(SIDEBAR_KEY, o ? "0" : "1");
      return !o;
    });
  }

  // Mobile drawer: Escape closes, resize-to-desktop closes, and focus is trapped
  // inside the drawer while it's open (it acts as a modal below md).
  useEffect(() => {
    if (!mobileOpen) return;
    const aside = asideRef.current;
    const focusables = () =>
      aside
        ? Array.from(
            aside.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key === "Tab" && aside) {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onResize = () => window.innerWidth >= 768 && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);

  const items = visibleNavItems({ canAccessAdmin, canStaff, memberOnly, roles, moduleAllowedRoles });
  const activeMenu = newNav ? activeMenuKey(pathname, newNav.groups) : null;
  // The Access requests item carries its waiting count (only fetched when the item is shown).
  const hasAccessItem = Boolean(newNav?.groups.some((g) => g.items.some((i) => i.key === "access-requests")));
  const [accessCount, setAccessCount] = useState(0);
  useEffect(() => {
    if (!hasAccessItem) return;
    let live = true;
    fetch("/api/admin/access-requests/count")
      .then((r) => (r.ok ? r.json() : { new: 0 }))
      .then((d) => live && setAccessCount(d.new ?? 0))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [hasAccessItem]);
  // UX8 — the Approvals item carries its waiting count the same way; refetched on navigation
  // and when a decision is made on /approvals (the page dispatches APPROVALS_CHANGED).
  const hasApprovalsItem = Boolean(newNav?.groups.some((g) => g.items.some((i) => i.key === "approvals")));
  const [approvalsCount, setApprovalsCount] = useState(0);
  useEffect(() => {
    if (!hasApprovalsItem) return;
    let live = true;
    const load = () =>
      fetch("/api/approvals/count")
        .then((r) => (r.ok ? r.json() : { waiting: 0 }))
        .then((d) => live && setApprovalsCount(d.waiting ?? 0))
        .catch(() => {});
    void load();
    window.addEventListener(APPROVALS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(APPROVALS_CHANGED, load);
    };
  }, [hasApprovalsItem, pathname]);
  const activeHref = activeNavHref(pathname, items);
  // Labels show when expanded on desktop, or always inside the mobile drawer.
  const labelled = open || mobileOpen;

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-[var(--qcard)] focus:px-4 focus:py-2 focus:text-[var(--qink)] focus:shadow-lg focus:ring-2 focus:ring-[var(--brand)]"
      >
        Skip to main content
      </a>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden [animation:fadeIn_.15s_ease]"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={asideRef}
        aria-label="Primary"
        className={[
          "fixed left-0 top-0 z-50 flex h-full flex-col text-white transition-[width,transform] duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)]",
          "motion-reduce:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          "w-64",
          open ? "md:w-64" : "md:w-20",
        ].join(" ")}
        style={{ background: "var(--rv-sidebar)" }}
      >
        {/* Header: logo + collapse/close toggle */}
        <div className={`flex h-[62px] flex-shrink-0 items-center border-b border-white/10 px-4 ${labelled ? "justify-between" : "justify-center"}`}>
          {labelled && (
            <Link href="/dashboard" className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70" onClick={() => setMobileOpen(false)}>
              <BrandLogo variant="white" className="h-7 w-auto" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => (mobileOpen ? setMobileOpen(false) : toggleSidebar())}
            aria-label={mobileOpen ? "Close menu" : open ? "Collapse sidebar" : "Expand sidebar"}
            className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {mobileOpen ? <X className="size-5 md:hidden" /> : open ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>
        </div>

        {/* UX3 (D2a): "Viewing as" sits at the top, just below the logo. */}
        {newNav?.showSwitch && (
          <ViewingAs current={newNav.viewRole} options={newNav.options} superAdmin={newNav.superAdmin} labelled={labelled} />
        )}

        {/* UX3 (D6): the role's menu, grouped by job; items the person can't open are hidden. */}
        {newNav && (
          <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
            {newNav.groups.map((g) => (
              <div key={g.label} className="mb-3 last:mb-0">
                {labelled ? (
                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white/60">{g.label}</p>
                ) : (
                  <div className="mx-auto my-1.5 h-px w-8 bg-white/10" aria-hidden />
                )}
                <ul className="space-y-1">
                  {g.items.map((item) => {
                    const active = item.key === activeMenu;
                    const Icon = MENU_ICONS[item.icon];
                    const count =
                      item.key === "access-requests" && accessCount > 0
                        ? accessCount
                        : item.key === "approvals" && approvalsCount > 0
                          ? approvalsCount
                          : null;
                    return (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          title={labelled ? undefined : item.label}
                          onClick={() => setMobileOpen(false)}
                          className={[
                            "relative flex items-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                            labelled ? "gap-3 px-3 py-2" : "mx-auto h-11 w-11 justify-center",
                            active ? "font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                          style={active ? { background: "var(--rv-active)" } : undefined}
                        >
                          <Icon className="size-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden />
                          {labelled && <span className="flex-1 text-[13.5px] font-medium">{item.label}</span>}
                          {count !== null &&
                            (labelled ? (
                              <span className="rounded-full bg-white/15 px-1.5 text-[11px] font-bold leading-[18px] text-white">{count}</span>
                            ) : (
                              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-white" aria-label={`${count} waiting`} />
                            ))}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}

        {/* Navigation (classic layout) */}
        {!newNav && (
        <nav aria-label="Main" className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            // The Dashboard item gains a dropdown of the mounted cockpit's sections
            // (Overview / Pipeline / Portfolio / …) — the page no longer draws its
            // own section pane, so this stays the ONE left navigation.
            const withSections = item.href === "/dashboard" && labelled && sections.length > 0;
            const link = (
              <Link
                key={withSections ? undefined : item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={labelled ? undefined : item.label}
                onClick={() => setMobileOpen(false)}
                className={[
                  "flex items-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  labelled ? "gap-3 px-3 py-2.5" : "mx-auto h-11 w-11 justify-center",
                  withSections ? "min-w-0 flex-1" : "",
                  active ? "font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")}
                style={active ? { background: "var(--rv-active)" } : undefined}
              >
                <Icon className="size-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden />
                {labelled && <span className="flex-1 text-[13.5px] rv:text-body-sm font-medium">{item.label}</span>}
              </Link>
            );
            if (!withSections) return link;
            return (
              <div key={item.href}>
                <div className="flex items-center gap-1">
                  {link}
                  <button
                    type="button"
                    aria-expanded={dashOpen}
                    aria-label={dashOpen ? "Collapse dashboard sections" : "Expand dashboard sections"}
                    onClick={() => setDashOpen((o) => !o)}
                    className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <ChevronDown className={`size-4 transition-transform ${dashOpen ? "" : "-rotate-90"}`} aria-hidden />
                  </button>
                </div>
                {dashOpen && (
                  <div className="ml-[21px] mt-1.5 space-y-1 border-l border-white/10 pl-2.5">
                    {sections.map((s) => {
                      const SIcon = SECTION_ICONS[s.icon] ?? Circle;
                      const sActive = s.id === activeSection;
                      const itemClass = [
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                        sActive ? "font-semibold text-white" : "font-medium text-white/70 hover:bg-white/10 hover:text-white",
                      ].join(" ");
                      if (s.href) {
                        return (
                          <Link key={s.id} href={s.href} onClick={() => setMobileOpen(false)} className={itemClass}>
                            <SIcon className="size-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                            <span>{s.label}</span>
                          </Link>
                        );
                      }
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-current={sActive ? "true" : undefined}
                          onClick={() => {
                            jumpToSection(s.id);
                            setMobileOpen(false);
                          }}
                          className={itemClass}
                          style={sActive ? { background: "var(--rv-active)" } : undefined}
                        >
                          <SIcon className="size-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        )}

        {/* User footer — identity only. DM1.73: the ONE account menu (with sign-out and
            tenant switching) is the header chip; the sidebar's duplicate menu and the
            standalone sign-out row were dropped. */}
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div className={`flex items-center gap-2.5 ${labelled ? "" : "justify-center"}`}>
            <span
              aria-hidden
              className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--w10)] text-[11.5px] font-bold text-[var(--ink3)]"
              style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))" }}
            >
              {getInitials(userName)}
            </span>
            {labelled && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] rv:text-body-sm font-semibold">{userName || "—"}</p>
                <p className="truncate text-[11px] rv:text-body-xs text-white/60">{userEmail}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Content column, offset by the sidebar on desktop */}
      <div className={`flex min-h-screen flex-col transition-[margin] duration-300 motion-reduce:transition-none ${open ? "md:ml-64" : "md:ml-20"}`}>
        {/* Top header */}
        <header
          className="sticky top-0 z-30 flex h-[62px] items-center gap-3 px-4 text-white shadow-sm md:px-6"
          style={{ background: "var(--rv-topbar)" }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-1.5 text-white transition-colors hover:bg-white/10 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-heading rv:text-heading-sm text-[17px] font-bold tracking-[-.3px]">
            {tenantName}
          </h1>
          {newNav && <CommandPalette menu={newNav.groups} />}
          <div className="flex items-center gap-1.5">
            <SetupNudge />
            <NotificationBell />
            <ThemeToggle />
            <UserMenu
              variant="chip"
              name={userName}
              email={userEmail}
              role={userRole}
              tenants={tenants}
              canSwitchTenant={canSwitchTenant}
              currentSlug={tenantSlug}
              uiMode={uiMode}
            />
            <AskQButton />
          </div>
        </header>

        <main id="main-content" className="flex flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
