import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Same focus recipe as the header (ThemeToggle's own focus-visible state) so
// keyboard focus reads consistently between the two marketing components.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

export function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden px-6 pb-20 pt-14 sm:pb-28 sm:pt-16"
      style={{
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--pbrand) 13%, transparent), transparent 62%)",
      }}
    >
      {/* Ambient blobs: transform/opacity-only drift (drift1/drift2, the same
          keyframes the app shell's AmbientField uses), not a box-shadow pulse —
          pulseGlow reads on small solid dots, not on shapes already blurred past
          their own edge, so it left this backdrop looking static. Reduced motion
          is handled globally (see the prefers-reduced-motion rule in globals.css). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-16 top-16 size-72 rounded-full bg-[color-mix(in_oklab,var(--pbrand)_28%,transparent)] blur-3xl [animation:drift1_18s_ease-in-out_infinite_alternate]" />
        <div className="absolute right-16 top-40 size-72 rounded-full bg-[color-mix(in_oklab,var(--blue)_22%,transparent)] blur-3xl [animation:drift2_22s_ease-in-out_infinite_alternate]" />
      </div>

      <div className="relative z-[1] mx-auto max-w-[900px] text-center [animation:fadeUp_.4s_ease]">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--qcard)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pbrand)] shadow-sm">
          <span className="size-2 shrink-0 rounded-full bg-[var(--pbrand)] [animation:pulseGlow_2.4s_infinite]" />
          <span>Portfolio &amp; programme management, with a copilot</span>
        </div>

        <h1 className="mx-auto mb-6 max-w-[820px] text-balance text-[34px] font-bold leading-[1.1] tracking-[-1px] text-[var(--qink)] sm:text-[44px] sm:leading-[1.08] sm:tracking-[-1.6px] md:text-[64px]">
          Intelligent Portfolio Management{" "}
          <span className="relative whitespace-nowrap text-[var(--pbrand)]">
            for the Modern Enterprise
            <svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 300 12" fill="none" aria-hidden>
              <path
                d="M2 10C100 2 200 2 298 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="[animation:arcIn_.8s_ease-out_.5s_backwards]"
              />
            </svg>
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-[620px] text-pretty text-[15.5px] leading-[1.6] text-[var(--ink35)] sm:text-[17px]">
          QUBIT unifies projects and programmes across every subsidiary and region — and Q, its
          built-in AI copilot, reminds, organizes and prioritizes so nothing slips.
        </p>

        <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className={`q-lift group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pbrand)] px-8 py-4 text-[15px] font-bold text-[var(--onbrand)] sm:w-auto ${FOCUS_RING}`}
          >
            Get started
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          <a
            href="#how"
            className={`inline-flex w-full items-center justify-center rounded-xl border border-[var(--hair)] bg-[var(--qcard)] px-8 py-4 text-[15px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--qink)] sm:w-auto ${FOCUS_RING}`}
          >
            See how Q works
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px]">
          <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[var(--ink5)]">
            Trusted across the group
          </span>
          <span className="rounded-full border border-[var(--hair)] px-[13px] py-[5px] font-bold text-[var(--ink4)]">KCB Group</span>
          <span className="rounded-full border border-[var(--hair)] px-[13px] py-[5px] font-bold text-[var(--ink4)]">Riverbank Group</span>
        </div>
      </div>
    </section>
  );
}
