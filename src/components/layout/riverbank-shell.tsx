"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { NAV_ITEMS, isNavActive } from "./nav-items";
import { TenantChip } from "./tenant-chip";
import { UserMenu } from "./user-menu";
import { AskQButton } from "./ask-q-button";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TimerWidget } from "@/components/clickup/timer-widget";

interface RiverbankShellProps {
  canAccessAdmin: boolean;
  canSwitchTenant: boolean;
  tenants: { slug: string; name: string }[];
  tenantSlug: string;
  tenantName: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

const SIDEBAR_KEY = "rv-sidebar-open";

export function RiverbankShell({
  canAccessAdmin,
  canSwitchTenant,
  tenants,
  tenantSlug,
  tenantName,
  userName,
  userEmail,
  children,
}: RiverbankShellProps) {
  const pathname = usePathname();
  // Default expanded; sync the persisted preference after mount (SSR-safe).
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const items = NAV_ITEMS.filter((n) => n.perm !== "admin:access" || canAccessAdmin);
  const pageTitle =
    items.find((n) => isNavActive(pathname, n.href))?.label ??
    (pathname.split("/").filter(Boolean)[0]?.replace(/-/g, " ") ?? "Dashboard");
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
            <Link href="/dashboard" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70" onClick={() => setMobileOpen(false)}>
              <QubitLogo square={9} gap={2.5} radius={2.5} color="#ffffff" />
              <span className="font-heading rv:font-sans text-[16.5px] font-bold tracking-[2.5px]">QUBIT</span>
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

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {items.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={labelled ? undefined : item.label}
                onClick={() => setMobileOpen(false)}
                className={[
                  "flex items-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  labelled ? "gap-3 px-3 py-2.5" : "mx-auto h-11 w-11 justify-center",
                  active ? "font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")}
                style={active ? { background: "var(--rv-active)" } : undefined}
              >
                <Icon className="size-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden />
                {labelled && <span className="flex-1 text-[13.5px] rv:text-body-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div className={`flex items-center gap-2.5 ${labelled ? "" : "justify-center"}`}>
            <UserMenu name={userName} email={userEmail} />
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
            {pageTitle}
          </h1>
          <div className="flex items-center gap-1.5">
            <TimerWidget />
            <NotificationBell />
            <ThemeToggle />
            <TenantChip currentSlug={tenantSlug} currentName={tenantName} canSwitch={canSwitchTenant} tenants={tenants} />
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
