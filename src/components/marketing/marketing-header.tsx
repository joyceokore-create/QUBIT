import Link from "next/link";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const NAV = [
  { href: "#features", label: "Product" },
  { href: "#how", label: "How Q works" },
  { href: "#security", label: "Security" },
];

// Focus ring shared by every interactive element in the header — same recipe as
// ThemeToggle's own focus-visible state, so keyboard focus reads consistently
// across the whole bar.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

export function MarketingHeader() {
  return (
    <header className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-[18px] sm:gap-[26px] sm:px-6 sm:py-[22px]">
      <Link href="/" className={`flex items-center gap-[11px] rounded-md ${FOCUS_RING}`}>
        <QubitLogo square={9} gap={2.5} radius={2.5} />
        <span className="text-[16.5px] font-bold tracking-[2.5px] text-[var(--qink)]">QUBIT</span>
      </Link>
      {/* Nav anchors need room to breathe next to the logo + actions, so they only
          join the bar at lg — below that the primary CTA carries the header alone. */}
      <nav aria-label="Primary" className="hidden flex-1 justify-center gap-[22px] lg:flex">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className={`rounded-sm text-[12.5px] font-semibold text-[var(--ink35)] transition-colors hover:text-[var(--qink)] ${FOCUS_RING}`}
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <Link
          href="/login"
          className={`hidden rounded-full border border-[var(--hair)] px-[18px] py-[9px] text-[12.5px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] sm:inline-flex ${FOCUS_RING}`}
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className={`q-lift rounded-full bg-[var(--pbrand)] px-[16px] py-[9px] text-[12.5px] font-bold text-[var(--onbrand)] sm:px-[18px] ${FOCUS_RING}`}
        >
          Get started
        </Link>
      </div>
    </header>
  );
}
