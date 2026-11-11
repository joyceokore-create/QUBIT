"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Compass, LogOut, Monitor, Moon, ShieldCheck, ClipboardCheck, LayoutDashboard, Rows3, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { UiMode } from "@/lib/ui-mode";
import { DENSITY_EVENT, DENSITY_KEY } from "@/lib/density";
import { useTour } from "@/components/tour/tour-provider";
import { signOut } from "next-auth/react";
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

interface TenantOption {
  slug: string;
  name: string;
}

interface UserMenuProps {
  name: string;
  email: string;
  /** Display role shown beneath the name in the chip variant (e.g. "Project Manager"). */
  role?: string;
  /**
   * When the viewer can switch tenants, the tenant switcher is folded into this
   * menu (the standalone chip is gone). Supply the tenant list + current slug.
   */
  tenants?: TenantOption[];
  canSwitchTenant?: boolean;
  currentSlug?: string;
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

// Each tenant carries its own brand disc colour, independent of the active theme brand.
function discColor(slug: string): string {
  return slug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";
}

export function UserMenu({
  name,
  email,
  role,
  tenants = [],
  canSwitchTenant = false,
  currentSlug,
  variant = "avatar",
  uiMode,
}: UserMenuProps) {
  const tour = useTour();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const showSwitch = canSwitchTenant && tenants.length > 0;
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
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex size-[var(--ds-control-h)] flex-none items-center justify-center rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface2)] text-[11px] font-bold text-[var(--ds-ink2)] transition-colors hover:border-[var(--ds-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)]"
        >
          {getInitials(name)}
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
      <DropdownMenuContent align="end" className="w-[250px]">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{name}</span>
            <span className="text-xs font-normal text-ink-3">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
            <DropdownMenuLabel className="text-[11px] font-semibold text-[var(--ds-ink3)]">Theme</DropdownMenuLabel>
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

        {showSwitch && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10.5px] uppercase tracking-[1.5px] text-[var(--ink5)]">
              Switch tenant
            </DropdownMenuLabel>
            {tenants.map((t) => {
              const isCurrent = t.slug === currentSlug;
              return (
                <DropdownMenuItem
                  key={t.slug}
                  className="gap-[10px] py-[9px]"
                  onSelect={() => {
                    if (isCurrent) return;
                    // A user belongs to one tenant; switching signs out so you can sign in as
                    // that organization's account. Tenant isolation (RLS) is never crossed.
                    void signOut({ callbackUrl: `/login?tenant=${t.slug}` });
                  }}
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full text-[10px] font-extrabold text-[var(--onbrand)]!"
                    style={{ background: discColor(t.slug) }}
                  >
                    {t.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-[var(--qink)]">{t.name}</span>
                    <span className="block text-[11px] text-[var(--ink4)]!">
                      {isCurrent ? "current" : "sign in to switch"}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Check className="size-3 text-brand" />
                  ) : (
                    <LogOut className="size-3 text-[var(--ink5)]!" />
                  )}
                </DropdownMenuItem>
              );
            })}
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
