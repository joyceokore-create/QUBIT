"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { INK_BUTTON } from "@/lib/surface";

export interface NewMenuItem {
  key: string;
  label: string;
  hint: string;
  href: string;
}

/** Design spec v2 top bar "+ New": a menu of what this person may create (the list is built
 * on the server from their permissions, so nothing here can't be opened). */
export function NewMenu({ items }: { items: NewMenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Create new" className={INK_BUTTON}>
        <Plus className="size-3.5" aria-hidden />
        <span className="max-sm:sr-only">New</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)]">
        {items.map((it) => (
          <DropdownMenuItem key={it.key} render={<Link href={it.href} />} className="flex-col items-start gap-0 rounded-[8px] px-[9px] py-[7px]">
            <span className="text-[12.5px] font-semibold">{it.label}</span>
            <span className="text-[11px] text-[var(--ds-ink3)]">{it.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
