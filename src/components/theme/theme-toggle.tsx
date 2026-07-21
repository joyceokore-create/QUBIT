"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * ☼/☾ theme toggle (design_handoff Phase 0). 34px circular ghost button:
 * neutral wash by default, brand outline on hover. Shows the Sun in dark mode
 * (tap → light) and the Moon in light mode (tap → dark).
 */
export function ThemeToggle({
  className,
  variant = "topbar",
}: {
  className?: string;
  /**
   * "topbar" (default) — chip tokens tuned for the dark app topbar.
   * "surface" — page tokens (readable on the light/dark page bg), for the
   * marketing header where the button sits on --qbg, not the topbar gradient.
   */
  variant?: "topbar" | "surface";
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The resolved theme is only known on the client, so every theme-dependent
  // attribute stays neutral until mounted — keeping SSR and the first client
  // paint identical (no hydration mismatch).
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const surface = variant === "surface";

  return (
    <button
      type="button"
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : undefined}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={[
        "flex size-[34px] flex-none items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        surface
          ? "border border-[var(--hair)] bg-[var(--qcard)] text-[var(--ink2)] shadow-sm hover:border-[var(--pbrand)] hover:text-[var(--pbrand)]"
          : "border border-[var(--tbchipbd)] bg-[var(--tbchipbg)] text-[var(--tbink)] hover:border-brand hover:text-[var(--tbinkS)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Render a stable icon until mounted to keep SSR and first client paint identical. */}
      {mounted && !isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
