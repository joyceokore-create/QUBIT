"use client";

import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
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

interface UserMenuProps {
  name: string;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--w10)] text-[11.5px] font-bold text-[var(--ink3)] transition-colors hover:border-brand"
        style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))" }}
      >
        {getInitials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
