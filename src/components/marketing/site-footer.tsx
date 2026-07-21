import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

// Same focus recipe as hero.tsx / marketing-header.tsx, so keyboard focus reads
// consistently across the whole page, footer included.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--w06)] bg-[var(--qbg)] px-6 py-12">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 sm:flex-row">
        <BrandLogo className="h-6 w-auto" />
        <div className="text-[12px] text-[var(--ink3)]">© 2026 QUBIT · Enterprise Portfolio &amp; Programme Management</div>
        <Link
          href="/login"
          className={`rounded-sm text-[12.5px] font-semibold text-[var(--pbrand)] hover:underline ${FOCUS_RING}`}
        >
          Sign in
        </Link>
      </div>
    </footer>
  );
}
