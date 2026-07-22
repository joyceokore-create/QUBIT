"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const NAV = [
  { href: "#home", id: "home", label: "Home" },
  { href: "#features", id: "features", label: "Product" },
  { href: "#how", id: "how", label: "How Q works" },
  { href: "#security", id: "security", label: "Security" },
];

// Focus ring shared by every interactive element in the header — same recipe as
// ThemeToggle's own focus-visible state, so keyboard focus reads consistently
// across the whole bar.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

// Layout mirrors the DeviasKit header: logo + wordmark, then left-aligned nav
// beside it; on the right a text sign-in link and a solid, softly-rounded CTA.
// Below md the nav collapses into a hamburger menu. Deviations from the reference
// are intentional: the CTA keeps QUBIT green, and the theme toggle stays.
export function MarketingHeader() {
  // Scroll spy: the active item is the last section whose top has scrolled past
  // the header line. Deterministic (no thin-band misfires) and defaults to Home
  // at the top of the page; forces the last item once scrolled to the bottom.
  const [active, setActive] = useState<string>(NAV[0].id);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const OFFSET = 120; // sticky header height + a little breathing room

    function onScroll() {
      let current = NAV[0].id;
      for (const n of NAV) {
        const el = document.getElementById(n.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) current = n.id;
      }
      // At the very bottom, the last section may never cross the line — force it.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = NAV[NAV.length - 1].id;
      }
      setActive(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Close the mobile menu on Escape, and whenever the viewport grows to desktop.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onResize = () => window.innerWidth >= 768 && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hair2)] bg-[color-mix(in_oklab,var(--qbg)_85%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1180px] items-center gap-8 px-6 py-4">
        <Link href="/" className={`flex items-center rounded-md ${FOCUS_RING}`} onClick={() => setMenuOpen(false)}>
          <BrandLogo className="h-8 w-auto" />
        </Link>

        {/* Desktop nav — left-aligned beside the logo, joins at md. */}
        <nav aria-label="Primary" className="hidden items-center gap-8 md:ml-6 md:flex lg:ml-10">
          {NAV.map((n) => {
            const isActive = active === n.id;
            return (
              <a
                key={n.href}
                href={n.href}
                aria-current={isActive ? "true" : undefined}
                className={`group grid rounded-sm text-[15px] transition-colors ${FOCUS_RING} ${
                  isActive ? "text-[var(--pbrand)]" : "text-[var(--ink35)] hover:text-[var(--pbrand)]"
                }`}
              >
                {/* Invisible bold twin reserves the bold width, so turning bold on
                    hover / when active doesn't shift the neighbouring nav items. */}
                <span aria-hidden className="invisible col-start-1 row-start-1 font-bold">{n.label}</span>
                <span className={`col-start-1 row-start-1 ${isActive ? "font-bold" : "font-medium group-hover:font-bold"}`}>
                  {n.label}
                </span>
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <ThemeToggle variant="surface" />
          <Link
            href="/login"
            className={`hidden text-[15px] font-semibold text-[var(--ink2)] transition-colors hover:text-[var(--qink)] md:inline-flex ${FOCUS_RING}`}
          >
            Sign in
          </Link>
          <Link
            href="/request-access"
            className={`q-lift hidden rounded-xl bg-[var(--pbrand)] px-5 py-2.5 text-[14px] font-bold text-[var(--onbrand)] md:inline-flex ${FOCUS_RING}`}
          >
            Request access
          </Link>

          {/* Hamburger — below md only. */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className={`flex size-[34px] items-center justify-center rounded-full border border-[var(--hair)] bg-[var(--qcard)] text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--pbrand)] md:hidden ${FOCUS_RING}`}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile menu — dropdown panel under the sticky bar. */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-[var(--hair2)] bg-[var(--qbg)] shadow-[var(--cardsh)] [animation:fadeUp_.18s_ease] md:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-4">
            {NAV.map((n) => {
              const isActive = active === n.id;
              return (
                <a
                  key={n.href}
                  href={n.href}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-[15px] transition-colors ${FOCUS_RING} ${
                    isActive
                      ? "bg-[color-mix(in_oklab,var(--pbrand)_10%,transparent)] font-bold text-[var(--pbrand)]"
                      : "font-medium text-[var(--ink2)] hover:bg-[var(--wash)] hover:text-[var(--qink)]"
                  }`}
                >
                  {n.label}
                </a>
              );
            })}

            <div className="my-2 h-px bg-[var(--hair2)]" />

            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className={`inline-flex items-center justify-center rounded-xl border border-[var(--hair)] bg-[var(--qcard)] px-5 py-3 text-[14px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--qink)] ${FOCUS_RING}`}
            >
              Sign in
            </Link>
            <Link
              href="/request-access"
              onClick={() => setMenuOpen(false)}
              className={`q-lift inline-flex items-center justify-center rounded-xl bg-[var(--pbrand)] px-5 py-3 text-[14px] font-bold text-[var(--onbrand)] ${FOCUS_RING}`}
            >
              Request access
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
