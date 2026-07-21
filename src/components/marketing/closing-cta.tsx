import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Same focus recipe as hero.tsx / marketing-header.tsx, but the ring-offset is
// pinned to this section's own dark gradient (not --qbg, which is the page bg
// and would show as a mismatched pale patch here).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b2239]";

export function ClosingCta() {
  return (
    <section
      className="bg-[linear-gradient(135deg,color-mix(in_oklab,var(--pbrand)_90%,#0b2239),color-mix(in_oklab,var(--pbrand)_60%,#0b2239))] px-6 py-24 dark:bg-[linear-gradient(135deg,#11402e,#0b2239)]"
    >
      {/* --pbrand inverts to a light mint in dark mode (see .dark in globals.css),
          which would turn this into a pale block and break the white text/button
          contrast below. The dark: override reuses the app's own navy/green
          --topbar stops (#0b2239 / #11402e) so this band stays a dark, saturated
          close in both themes — same fix --topbar itself already makes. */}
      <div className="mx-auto max-w-[820px] text-center">
        <h2 className="mb-6 text-[36px] font-bold leading-[1.1] tracking-[-1px] text-white md:text-[52px]">
          Bring Q to your portfolio.
        </h2>
        <p className="mb-10 text-[18px] leading-[1.6] text-white/85">
          Sign in to see your entire portfolio in one command center — with a copilot that keeps it moving.
        </p>
        {/* Button surface is always white, so its label is a fixed literal (the
            light-theme --pbrand value) rather than var(--pbrand) — using the
            token here would flip to a low-contrast light mint in dark mode. */}
        <Link
          href="/login"
          className={`group inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-[16px] font-bold text-[#1b7a3e] transition-transform hover:scale-105 ${FOCUS_RING}`}
        >
          Sign in to QUBIT
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
