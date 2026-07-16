"use client";

import { Check, ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TenantOption {
  slug: string;
  name: string;
}

interface TenantChipProps {
  currentSlug: string;
  currentName: string;
  canSwitch: boolean;
  /** All tenants (only supplied/rendered when the viewer can switch). */
  tenants?: TenantOption[];
}

// Each tenant carries its own brand disc colour, independent of the active theme brand.
function discColor(slug: string): string {
  return slug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";
}

function Disc({ slug, initial, size = 22 }: { slug: string; initial: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-extrabold text-[var(--onbrand)]"
      style={{ width: size, height: size, fontSize: size < 24 ? 10.5 : 10, background: discColor(slug) }}
    >
      {initial}
    </span>
  );
}

export function TenantChip({ currentSlug, currentName, canSwitch, tenants = [] }: TenantChipProps) {
  const initial = currentName.charAt(0).toUpperCase();

  // Without switch rights the chip is a static brand identity marker (no chevron, no menu).
  if (!canSwitch) {
    return (
      <div className="flex items-center gap-[9px] rounded-full border border-[var(--tbchipbd)] bg-[var(--tbchipbg)] py-[6px] pl-2 pr-[14px] text-[12.5px]">
        <Disc slug={currentSlug} initial={initial} />
        <span className="font-semibold text-[var(--tbinkS)]">{currentName}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-[9px] rounded-full border border-[var(--tbchipbd)] bg-[var(--tbchipbg)] py-[6px] pl-2 pr-[14px] text-[12.5px] text-[var(--tbink)] transition-colors hover:border-brand">
        <Disc slug={currentSlug} initial={initial} />
        <span className="font-semibold text-[var(--tbinkS)]">{currentName}</span>
        <ChevronDown className="size-[10px] text-[var(--tbink)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px]">
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
              <Disc slug={t.slug} initial={t.name.charAt(0).toUpperCase()} size={24} />
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-[var(--qink)]">{t.name}</span>
                <span className="block text-[11px] text-[var(--ink4)]">
                  {isCurrent ? "current" : "sign in to switch"}
                </span>
              </span>
              {isCurrent ? <Check className="size-3 text-brand" /> : <LogOut className="size-3 text-[var(--ink5)]" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
