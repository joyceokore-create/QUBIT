import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/** Design spec v2 text link (`.link`): 12px/600 brand-ink with a trailing 12px arrow. Used for
 * card links ("All Requests"), rail links and footnote links. */
export const TEXT_LINK = `inline-flex items-center gap-[3px] whitespace-nowrap rounded-[4px] text-[12px] font-semibold text-[var(--ds-brand-ink)] hover:underline underline-offset-2 ${FOCUS}`;

export function TextLink({ href, children, className, arrow = true }: { href: string; children: ReactNode; className?: string; arrow?: boolean }) {
  return (
    <Link href={href} className={cn(TEXT_LINK, className)}>
      {children}
      {arrow && <ArrowRight className="size-3" aria-hidden />}
    </Link>
  );
}

/** The same look on a button (opens a drawer, clears filters). */
export function TextButton({ onClick, children, className, arrow = false }: { onClick: () => void; children: ReactNode; className?: string; arrow?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(TEXT_LINK, className)}>
      {children}
      {arrow && <ArrowRight className="size-3" aria-hidden />}
    </button>
  );
}
