"use client";

import Link from "next/link";
import { Check, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { signOutAction } from "@/lib/auth-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  /**
   * When the viewer can switch tenants, the tenant switcher is folded into this
   * menu (the standalone chip is gone). Supply the tenant list + current slug.
   */
  tenants?: TenantOption[];
  canSwitchTenant?: boolean;
  currentSlug?: string;
}

// Each tenant carries its own brand disc colour, independent of the active theme brand.
function discColor(slug: string): string {
  return slug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";
}

export function UserMenu({
  name,
  email,
  tenants = [],
  canSwitchTenant = false,
  currentSlug,
}: UserMenuProps) {
  const showSwitch = canSwitchTenant && tenants.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--w10)] text-[11.5px] font-bold text-[var(--ink3)] transition-colors hover:border-brand"
        style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))" }}
      >
        {getInitials(name)}
      </DropdownMenuTrigger>
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
                    className="flex size-6 items-center justify-center rounded-full text-[10px] font-extrabold text-[var(--onbrand)]"
                    style={{ background: discColor(t.slug) }}
                  >
                    {t.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-[var(--qink)]">{t.name}</span>
                    <span className="block text-[11px] text-[var(--ink4)]">
                      {isCurrent ? "current" : "sign in to switch"}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Check className="size-3 text-brand" />
                  ) : (
                    <LogOut className="size-3 text-[var(--ink5)]" />
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
