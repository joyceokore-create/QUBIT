"use client";

import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shared pre-auth canvas for the login + request-access screens. The atmospheric backdrop
 * (near-black base + navy/brand glows + ghost wordmark) is identical in light and dark; only
 * the card flips (bright light card / dark glass card) via the --l-* tokens in globals.css.
 * `brand` sets --login-brand on the card (login passes the resolved tenant brand; request
 * access passes the product green var(--pbrand)).
 */
export function AuthShell({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <div
      className="login-shell relative min-h-screen w-full font-sans"
      style={
        {
          background: [
            "radial-gradient(ellipse 60% 50% at 15% 25%, var(--l-glow-navy), transparent 60%)",
            "radial-gradient(ellipse 50% 50% at 85% 80%, var(--l-glow-brand), transparent 65%)",
            "var(--l-bg)",
          ].join(", "),
          "--font-display": "var(--font-lufga)",
          "--font-body": "var(--font-lufga)",
        } as CSSProperties
      }
    >
      {/* Backdrop is dark in both themes, so the toggle keeps the topbar (light-on-glass) look. */}
      <ThemeToggle className="absolute right-[18px] top-[18px] z-20" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div
          className="rounded-2xl border border-[var(--l-card-bd)] bg-[var(--l-card-bg)] p-5 backdrop-blur-sm [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both] sm:p-6"
          style={
            {
              "--login-brand": brand,
              boxShadow: ["var(--l-card-sh)", "0 20px 70px -30px var(--l-card-glow)"].join(", "),
            } as CSSProperties
          }
        >
          {children}
        </div>
      </main>

      {/* Giant faded background wordmark — behind the card, clipped to the viewport. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 flex max-h-[38vh] justify-between overflow-hidden px-4 font-black uppercase leading-none text-[var(--l-wm)]"
        style={{ fontSize: "clamp(40px, 11vw, 200px)" }}
      >
        {"QUBIT".split("").map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
    </div>
  );
}
