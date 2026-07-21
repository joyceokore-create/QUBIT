import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Same focus recipe as hero.tsx / marketing-header.tsx, but the ring-offset is
// pinned to this section's own dark gradient (via --cta-ring in globals.css,
// not --qbg, which is the page bg and would show as a mismatched pale patch here).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cta-ring)]";

export function ClosingCta() {
  return (
    // Full-bleed band: the gradient lives on the section itself (edge-to-edge,
    // no corner radius), content stays centred within a max-width.
    // --cta-band is a GRADIENT token (globals.css), applied as a background image
    // — the `bg-[var(--cta-band)]` utility compiles to background-color and
    // silently drops the gradient (white text ends up on the page bg). Light =
    // green→navy; dark is pinned to the app's navy/green --topbar stops (--pbrand
    // inverts to a light mint in dark and would break the white-on-band contrast).
    <section
      className="relative overflow-hidden py-20 text-center sm:py-28"
      style={{ backgroundImage: "var(--cta-band)" }}
    >
      {/* Depth: faint grid + a soft top highlight, spanning the full band. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_80%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(800px 280px at 50% -40%, rgba(255,255,255,0.20), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-[720px] px-6">
        <h2 className="text-balance text-[32px] font-bold leading-[1.08] tracking-[-1px] text-white sm:text-[46px]">
          Bring Q to your portfolio.
        </h2>
        <p className="mx-auto mt-5 max-w-[540px] text-pretty text-[16px] leading-[1.6] text-white/85 sm:text-[18px]">
          Sign in to see your entire portfolio in one command center — with a copilot that keeps it moving.
        </p>
        {/* Button surface is always white, so its label uses --cta-btn-fg (the
            light-theme --pbrand value in both themes) rather than var(--pbrand)
            directly — the raw token would flip to a low-contrast light mint in
            dark mode. */}
        <Link
          href="/login"
          className={`group mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-9 py-4 text-[16px] font-bold text-[var(--cta-btn-fg)] shadow-lg transition-transform hover:scale-[1.03] ${FOCUS_RING}`}
        >
          Sign in to QUBIT
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
