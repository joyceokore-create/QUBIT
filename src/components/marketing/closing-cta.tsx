import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Same focus recipe as hero.tsx / marketing-header.tsx, but the ring-offset is
// pinned to this section's own dark gradient (via --cta-ring in globals.css,
// not --qbg, which is the page bg and would show as a mismatched pale patch here).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cta-ring)]";

export function ClosingCta() {
  return (
    <section className="bg-[var(--cta-band)] px-6 py-24">
      {/* --cta-band is a themed token (see globals.css): light is the green→navy
          color-mix gradient, dark is pinned to the app's own navy/green --topbar
          stops. --pbrand itself inverts to a light mint in dark mode, which would
          turn this into a pale block and break the white text/button contrast
          below — same fix --topbar itself already makes. */}
      <div className="mx-auto max-w-[820px] text-center">
        <h2 className="mb-6 text-[36px] font-bold leading-[1.1] tracking-[-1px] text-white md:text-[52px]">
          Bring Q to your portfolio.
        </h2>
        <p className="mb-10 text-[18px] leading-[1.6] text-white/85">
          Sign in to see your entire portfolio in one command center — with a copilot that keeps it moving.
        </p>
        {/* Button surface is always white, so its label uses --cta-btn-fg (the
            light-theme --pbrand value in both themes) rather than var(--pbrand)
            directly — the raw token would flip to a low-contrast light mint in
            dark mode. */}
        <Link
          href="/login"
          className={`group inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-[16px] font-bold text-[var(--cta-btn-fg)] transition-transform hover:scale-105 ${FOCUS_RING}`}
        >
          Sign in to QUBIT
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
