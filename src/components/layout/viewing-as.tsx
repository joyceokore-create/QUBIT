"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPER_ADMIN, VIEW_ROLE_HOME, VIEW_ROLE_LABEL, type ViewRole } from "@/lib/view-roles";

/**
 * "Viewing as" (UX plan D2a), at the top of the sidebar just below the logo. It changes the
 * home page and the menu only — never permissions. Super Admin sees it as "Preview home as…"
 * (their own data, not impersonation). Each switch is stored and audited server-side, then
 * the person lands on that role's home.
 */
export function ViewingAs({
  current,
  options,
  superAdmin,
  labelled,
}: {
  current: ViewRole;
  options: ViewRole[];
  superAdmin: boolean;
  /** Sidebar expanded (or the mobile sheet): show the label; collapsed shows an icon. */
  labelled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Title Case labels (D-F2b): "as" is the last word, so it's capitalised.
  const caption = superAdmin ? "Preview Home As" : "Viewing As";

  async function choose(role: string) {
    setMenuOpen(false);
    if (role === current) return;
    setError(null);
    const res = await fetch("/api/me/view-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't switch. Try again.");
      return;
    }
    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className={labelled ? "px-3 pt-1" : "flex justify-center pt-3"}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label={`${caption}: ${VIEW_ROLE_LABEL[current]}. Change`}
          disabled={pending}
          className={
            labelled
              ? "flex w-full items-center gap-2 rounded-[10px] bg-white/10 px-2.5 py-2 text-left text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)] outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 data-[popup-open]:bg-white/20 data-[popup-open]:shadow-[inset_0_0_0_1px_rgba(255,255,255,.45)]"
              : "grid size-11 place-items-center rounded-lg border border-white/15 bg-white/[.06] text-white/85 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
          }
        >
          {labelled ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] text-[var(--ds-side-dim)]">{caption}</span>
                <span className="block truncate text-[12.5px] font-bold text-white">{VIEW_ROLE_LABEL[current]}</span>
              </span>
              <ChevronDown className="size-4 flex-none text-white/70" aria-hidden />
            </>
          ) : (
            <Eye className="size-[18px]" strokeWidth={1.75} aria-hidden />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={labelled ? "bottom" : "right"} className="w-[240px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)]">
          <DropdownMenuLabel className="text-[10.5px] font-semibold text-[var(--ds-ink3)]">{caption}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={(v) => void choose(String(v))}>
            {options.map((role) => (
              <DropdownMenuRadioItem key={role} value={role} className="rounded-[8px] px-[9px] py-[7px] data-checked:bg-[var(--ds-brand-wash)] data-checked:text-[var(--ds-brand-ink)]">
                <span className="flex flex-col">
                  <span className="text-[12.5px] font-semibold">{VIEW_ROLE_LABEL[role]}</span>
                  <span className="text-[11px] text-[var(--ds-ink3)]">{VIEW_ROLE_HOME[role]}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="px-[9px] py-1 text-[10.5px] leading-[1.4] text-[var(--ds-ink3)]">
            {current === SUPER_ADMIN || superAdmin
              ? "Shows that role's home and menu with your own data. It isn't impersonation."
              : "Changes your home page and menu only. What you can open stays the same."}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="mt-1.5 text-[11.5px] text-[#ffb4b4]">
          {error}
        </p>
      )}
    </div>
  );
}
