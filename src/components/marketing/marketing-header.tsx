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

// Layout mirrors the DeviasKit header: logo + wordmark, then left-aligned nav
// beside it; on the right a text sign-in link and a solid, softly-rounded CTA.
// Deviations from the reference are intentional: the CTA keeps QUBIT green (not
// Devias indigo) for brand identity, and the theme toggle stays (QUBIT ships
// both themes — the reference is dark-only).
export function MarketingHeader() {
  return (
    <header className="mx-auto flex max-w-[1180px] items-center gap-8 px-6 py-6 sm:py-7">
      <Link href="/" className={`flex items-center gap-2.5 rounded-md ${FOCUS_RING}`}>
        <QubitLogo square={10} gap={3} radius={3} />
        <span className="text-[19px] font-bold tracking-[-0.2px] text-[var(--qink)]">QUBIT</span>
      </Link>

      {/* Nav sits immediately after the logo (left-aligned), joining at md. */}
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className={`rounded-sm text-[15px] font-medium text-[var(--ink35)] transition-colors hover:text-[var(--qink)] ${FOCUS_RING}`}
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <ThemeToggle />
        <Link
          href="/login"
          className={`hidden text-[15px] font-semibold text-[var(--ink2)] transition-colors hover:text-[var(--qink)] sm:inline-flex ${FOCUS_RING}`}
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className={`q-lift rounded-xl bg-[var(--pbrand)] px-5 py-2.5 text-[14px] font-bold text-[var(--onbrand)] ${FOCUS_RING}`}
        >
          Get started
        </Link>
      </div>
    </header>
  );
}
