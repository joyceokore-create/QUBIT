import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

// Same focus recipe as the header (ThemeToggle's own focus-visible state) so
// keyboard focus reads consistently between the two marketing components.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

// Centred masthead (DeviasKit-style): announcement pill → large two-tone
// headline → subcopy → primary + ghost CTAs → honest trust row. No product mock
// card. Trust signal uses the real group names (KCB / Riverbank), not fabricated
// ratings or avatars.
export function Hero() {
  return (
    <section id="home" className="relative scroll-mt-20 overflow-hidden px-6 pb-24 pt-12 text-center sm:pt-16">
      {/* One intentional backdrop: a brand→navy wash over a faint dotted grid.
          Reduced motion is handled globally (prefers-reduced-motion in globals.css). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          // Diagonal glow (as on the login page, login-form.tsx): blue top-left,
          // green bottom-right. Theme-aware via --blue / --pbrand tokens (deep on
          // dark, gentle on light).
          backgroundImage: [
            "radial-gradient(ellipse 60% 55% at 6% 10%, color-mix(in oklab, var(--blue) 24%, transparent), transparent 60%)",
            "radial-gradient(ellipse 62% 62% at 94% 86%, color-mix(in oklab, var(--pbrand) 28%, transparent), transparent 60%)",
            "radial-gradient(900px 440px at 50% -140px, color-mix(in oklab, var(--pbrand) 9%, transparent), transparent 66%)",
          ].join(", "),
        }}
      />
      {/* Box grid (DeviasKit-style): large cells, kept softly faded via a radial
          mask (as before) so the grid dissolves toward the edges/bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.6] [mask-image:radial-gradient(85%_72%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(var(--hair2) 1px, transparent 1px), linear-gradient(90deg, var(--hair2) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      {/* Scattered starfield — irregular faint dots spread across the whole
          field (theme-aware via alpha washes: white on dark, ink on light). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_100%_at_50%_40%,black_60%,transparent)]"
        style={{
          backgroundImage: [
            "radial-gradient(2px 2px at 5% 12%, var(--w16), transparent)",
            "radial-gradient(1.5px 1.5px at 11% 40%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 9% 72%, var(--w14), transparent)",
            "radial-gradient(2px 2px at 15% 88%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 21% 22%, var(--w14), transparent)",
            "radial-gradient(1.5px 1.5px at 25% 58%, var(--w10), transparent)",
            "radial-gradient(2px 2px at 28% 84%, var(--w14), transparent)",
            "radial-gradient(1.5px 1.5px at 33% 10%, var(--w12), transparent)",
            "radial-gradient(2px 2px at 38% 46%, var(--w16), transparent)",
            "radial-gradient(1.5px 1.5px at 42% 78%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 47% 20%, var(--w14), transparent)",
            "radial-gradient(1.5px 1.5px at 53% 52%, var(--w10), transparent)",
            "radial-gradient(2px 2px at 58% 82%, var(--w14), transparent)",
            "radial-gradient(1.5px 1.5px at 63% 14%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 68% 44%, var(--w14), transparent)",
            "radial-gradient(2px 2px at 72% 74%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 77% 24%, var(--w16), transparent)",
            "radial-gradient(1.5px 1.5px at 81% 56%, var(--w12), transparent)",
            "radial-gradient(2px 2px at 85% 86%, var(--w14), transparent)",
            "radial-gradient(1.5px 1.5px at 89% 30%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 93% 62%, var(--w14), transparent)",
            "radial-gradient(2px 2px at 96% 16%, var(--w16), transparent)",
            "radial-gradient(1.5px 1.5px at 3% 50%, var(--w12), transparent)",
            "radial-gradient(1.5px 1.5px at 60% 92%, var(--w10), transparent)",
          ].join(","),
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Editorial split: headline on the left, supporting copy + CTAs + trust
          on the right. Stacks (centred) below lg. */}
      <div className="relative z-[1] mx-auto grid max-w-[1180px] items-center gap-10 py-12 text-center lg:grid-cols-2 lg:gap-16 lg:py-20 lg:text-left [animation:fadeUp_.4s_ease]">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--qcard)] px-4 py-2 text-[13px] font-medium text-[var(--ink2)] shadow-sm">
            <Sparkles className="size-4 text-[var(--pbrand)]" aria-hidden />
            Portfolio &amp; programme management, with a copilot
          </div>

          <h1 className="text-balance text-[34px] font-[800] leading-[1.05] tracking-[-1px] text-[var(--qink)] sm:text-[52px] sm:leading-[1.02] sm:tracking-[-1.8px] lg:text-[58px] xl:text-[64px]">
            Intelligent Portfolio Management{" "}
            <span className="text-[var(--pbrand)]">for the Modern Enterprise</span>
          </h1>
        </div>

        <div className="mx-auto max-w-[520px] lg:mx-0">
          <p className="text-pretty text-[16px] leading-[1.6] text-[var(--ink3)] sm:text-[18px]">
            QUBIT unifies projects and programmes across every subsidiary and region — and Q, its
            built-in AI copilot, reminds, organizes and prioritizes so nothing slips.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3.5 sm:flex-row lg:items-start">
            <Link
              href="/request-access"
              className={`q-lift group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pbrand)] px-8 py-4 text-[15px] font-bold text-[var(--onbrand)] shadow-[0_8px_24px_color-mix(in_oklab,var(--pbrand)_28%,transparent)] sm:w-auto ${FOCUS_RING}`}
            >
              Request access
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href="#how"
              className={`inline-flex w-full items-center justify-center rounded-xl border border-[var(--hair)] bg-[var(--qcard)] px-8 py-4 text-[15px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--qink)] sm:w-auto ${FOCUS_RING}`}
            >
              See how Q works
            </a>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
            <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[var(--ink3)]">
              Trusted across the group
            </span>
            <span className="rounded-full border border-[var(--hair)] px-[13px] py-[5px] text-[12px] font-bold text-[var(--ink3)]">KCB Group</span>
            <span className="rounded-full border border-[var(--hair)] px-[13px] py-[5px] text-[12px] font-bold text-[var(--ink3)]">Riverbank Group</span>
          </div>
        </div>
      </div>
    </section>
  );
}
