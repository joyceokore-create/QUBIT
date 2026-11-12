"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Compass, LogOut, Monitor, Moon, ShieldCheck, ClipboardCheck, LayoutDashboard, Rows3, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { UiMode } from "@/lib/ui-mode";
import { DENSITY_EVENT, DENSITY_KEY } from "@/lib/density";
import { useTour } from "@/components/tour/tour-provider";
import { signOutAction } from "@/lib/auth-actions";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/format";


interface UserMenuProps {
  name: string;
  email: string;
  /** Display role shown beneath the name in the chip variant (e.g. "Project Manager"). */
  role?: string;
  /**
   * "avatar" (default) — bare initials circle (sidebar footer, default topbar).
   * "chip" — a profile pill with avatar + name + chevron, for the branded
   *          Riverbank header where it stands in for the old tenant chip.
   */
  variant?: "avatar" | "chip" | "light";
  /** UX3 (D11): the person's layout. Offers the switch back (or forward) and, in the new
   * layout, the density setting that used to sit on the dashboard. */
  uiMode?: UiMode;
}


export function UserMenu({
  name,
  email,
  role,
  variant = "avatar",
  uiMode,
}: UserMenuProps) {
  const tour = useTour();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      setCompact(window.localStorage.getItem(DENSITY_KEY) === "1");
    } catch {
      // storage blocked — keep the default density
    }
  }, []);

  function toggleCompact(next: boolean) {
    setCompact(next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next ? "1" : "0");
    } catch {
      // storage blocked — the change still applies to this page
    }
    window.dispatchEvent(new CustomEvent(DENSITY_EVENT, { detail: next }));
  }

  async function switchLayout(mode: UiMode) {
    const res = await fetch("/api/me/ui-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch(() => null);
    if (!res?.ok) return;
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <DropdownMenu>
      {variant === "chip" ? (
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-full py-1 pl-1.5 pr-1.5 text-white sm:pr-3 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--tbchipbd)] bg-[var(--tbchipbg)] text-[11.5px] font-bold text-[var(--tbink)]">
            {getInitials(name)}
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight max-sm:hidden">
            <span className="max-w-[160px] truncate text-[13px] font-semibold">{name || "Account"}</span>
            {role && <span className="max-w-[160px] truncate text-[11px] font-normal text-white/70">{role}</span>}
          </span>
          <ChevronDown className="size-[13px] flex-none opacity-70 max-sm:hidden" />
        </DropdownMenuTrigger>
      ) : variant === "light" ? (
        // Designer, 12 Nov 2026: avatar + name (email muted underneath) + arrow.
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex flex-none items-center gap-2 rounded-[var(--ds-radius-control)] py-1 pl-1 pr-1.5 text-left transition-colors hover:bg-[var(--ds-surface2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)]"
        >
          <span className="flex size-[var(--ds-control-h)] flex-none items-center justify-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface2)] text-[11px] font-bold text-[var(--ds-ink2)]">
            {getInitials(name)}
          </span>
          <span className="flex min-w-0 flex-col leading-tight max-xl:hidden">
            <span className="max-w-[220px] truncate text-[13px] font-semibold text-[var(--ds-ink)]">{name || "Account"}</span>
            {email && <span className="max-w-[220px] truncate text-[11.5px] text-[var(--ds-ink3)]">{email}</span>}
          </span>
          <ChevronDown className="size-3.5 flex-none text-[var(--ds-ink3)] max-md:hidden" aria-hidden />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--w10)] text-[11.5px] font-bold text-[var(--ink3)] transition-colors hover:border-brand"
          style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))" }}
        >
          {getInitials(name)}
        </DropdownMenuTrigger>
      )}
      {/* Designer, 12 Nov 2026: same card as the filter dropdowns; no name/email header (the top bar
          shows them); roomier, lighter rows (.ds-menu in design-spec.css). The old "Switch tenant"
          list is gone: an account belongs to one organisation, so it could only sign you out. */}
      <DropdownMenuContent align="end" sideOffset={8} className="ds-menu w-[240px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)] ring-1 ring-[var(--ds-line)]">
        <DropdownMenuItem render={<Link href="/settings/mfa" />}>
          <ShieldCheck />
          Two-factor authentication
        </DropdownMenuItem>
        {tour.eligible && (
          <DropdownMenuItem onClick={() => tour.startApp()}>
            <Compass />
            Show me around
          </DropdownMenuItem>
        )}
        {tour.eligible && tour.projects.some((p) => p.done < p.total) && (
          <DropdownMenuItem onClick={() => tour.startSetup()}>
            <ClipboardCheck />
            Set up my projects
          </DropdownMenuItem>
        )}

        {uiMode === "new" && (
          <>
            <DropdownMenuSeparator />
            {/* UX fidelity F1 (D-F9): Light / Dark / System, default Light. */}
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={(v) => setTheme(String(v))}>
              <DropdownMenuRadioItem value="light">
                <Sun />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={compact} onCheckedChange={(v) => toggleCompact(Boolean(v))}>
              <Rows3 />
              Compact density
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onClick={() => void switchLayout("classic")}>
              <LayoutDashboard />
              Back to classic dashboard
            </DropdownMenuItem>
          </>
        )}
        {uiMode === "classic" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void switchLayout("new")}>
              <Sparkles />
              Try the new layout
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <form action={signOutAction} className="w-full">
          <DropdownMenuItem
            variant="destructive"
            nativeButton
            closeOnClick={false}
            render={<button type="submit" className="w-full" />}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
