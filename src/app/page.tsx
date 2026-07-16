import Link from "next/link";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Public marketing landing (design_handoff screen 0a). Product-branded green in
// both themes — never tenant-branded. `/` is a public route (see middleware.ts).
export const metadata = {
  title: "QUBIT — Your entire portfolio. One command center. One copilot.",
};

const FEATURES = [
  {
    glyph: <span className="size-2 rounded-full bg-[var(--pbrand)]" />,
    title: "A briefing, not a backlog",
    body: "Q opens your day with the three things that matter — ranked, explained, and one click from action.",
  },
  {
    glyph: <span className="text-[13px] font-bold text-[var(--pbrand)]">1</span>,
    title: "Priorities with reasons",
    body: "Every task ranked by deadline, dependencies and risk — and Q shows its working, so you can trust the order.",
  },
  {
    glyph: <QubitLogo square={5} gap={1.5} radius={1.5} />,
    title: "Group to branch in two clicks",
    body: "Portfolio × subsidiary heatmaps, programmes, milestones and RAID — drill from group level to a single branch.",
  },
];

const HOW = [
  {
    step: "01 — REMINDS",
    body: "Deadline nudges, stale-invite chasers and slippage alerts arrive before things go red — never after.",
  },
  {
    step: "02 — ORGANIZES",
    body: "Q drafts your steering packs and status updates from live portfolio data — you review, not rewrite.",
  },
  {
    step: "03 — PRIORITIZES",
    body: "Your task list is re-ranked as dependencies shift — with a “why” behind every position.",
  },
];

const SECURITY_CHIPS = ["Row-level security", "RBAC", "TOTP MFA", "Full audit trail"];

const GET_STARTED_SHADOW = "0 6px 24px color-mix(in oklab, var(--pbrand) var(--glowA), transparent)";
const PILL_SHADOW = "0 4px 20px color-mix(in oklab, var(--pbrand) var(--glowA), transparent)";

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "var(--qbg)",
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--pbrand) 13%, transparent), transparent 62%), radial-gradient(var(--w06) 1px, transparent 1.5px)",
        backgroundSize: "auto, 26px 26px",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-[1180px] items-center gap-[26px] px-6 py-[22px]">
        <Link href="/" className="flex items-center gap-[11px]">
          <QubitLogo square={9} gap={2.5} radius={2.5} />
          <span className="text-[16.5px] font-bold tracking-[2.5px] text-[var(--qink)]">QUBIT</span>
        </Link>
        <nav className="flex flex-1 justify-center gap-[22px]">
          <a
            href="#q-features"
            className="text-[12.5px] font-semibold text-[var(--ink35)] transition-colors hover:text-[var(--qink)]"
          >
            Product
          </a>
          <a
            href="#q-how"
            className="text-[12.5px] font-semibold text-[var(--ink35)] transition-colors hover:text-[var(--qink)]"
          >
            How Q works
          </a>
          <a
            href="#q-security"
            className="text-[12.5px] font-semibold text-[var(--ink35)] transition-colors hover:text-[var(--qink)]"
          >
            Security
          </a>
        </nav>
        <ThemeToggle />
        <Link
          href="/login"
          className="rounded-full border border-[var(--w14)] px-[18px] py-[9px] text-[12.5px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)]"
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className="q-lift rounded-full bg-[var(--pbrand)] px-[18px] py-[9px] text-[12.5px] font-bold text-[var(--onbrand)]"
          style={{ boxShadow: PILL_SHADOW }}
        >
          Get started
        </Link>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-14 px-6 pb-[70px] pt-16 lg:grid-cols-[1.05fr_.95fr]">
        <div className="[animation:fadeUp_.4s_ease]">
          <div className="mb-4 flex items-center gap-[9px]">
            <span className="size-2 rounded-full bg-[var(--pbrand)] [animation:pulseGlow_2.4s_infinite]" />
            <span className="text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">
              Portfolio &amp; programme management, with a copilot
            </span>
          </div>
          <h1 className="mb-[20px] text-[50px] font-bold leading-[1.07] tracking-[-1.8px] text-[var(--qink)]">
            Intelligent Portfolio
            <br />
            <span
              style={{
                background: "linear-gradient(92deg, #1B9152, #6FAE33)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Management for the
            </span>
            <br />
            <span
              style={{
                background: "linear-gradient(92deg, #D08A1D, #9E6317)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Modern Enterprise
            </span>
          </h1>
          <p className="mb-[26px] max-w-[480px] text-pretty text-[15.5px] leading-[1.65] text-[var(--ink35)]">
            QUBIT unifies projects and programmes across every subsidiary and region — and Q, its
            built-in AI copilot, reminds, organizes and prioritizes so nothing slips.
          </p>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="q-lift rounded-full bg-[var(--pbrand)] px-[26px] py-[13px] text-[14px] font-bold text-[var(--onbrand)]"
              style={{ boxShadow: GET_STARTED_SHADOW }}
            >
              Get started
            </Link>
            <a
              href="#q-how"
              className="inline-flex items-center rounded-full border border-[var(--w14)] px-[24px] py-[13px] text-[14px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--qink)]"
            >
              See how Q works
            </a>
          </div>
          <div className="mt-[38px] flex items-center gap-[14px]">
            <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[var(--ink5)]">
              Trusted across the group
            </span>
            <span className="rounded-full border border-[var(--w10)] px-[13px] py-[5px] text-[12px] font-bold text-[var(--ink4)]">
              KCB Group
            </span>
            <span className="rounded-full border border-[var(--w10)] px-[13px] py-[5px] text-[12px] font-bold text-[var(--ink4)]">
              Riverbank Group
            </span>
          </div>
        </div>

        {/* Mocked briefing card */}
        <div className="relative [animation:fadeUp_.5s_ease]">
          <div
            className="pointer-events-none absolute -inset-10"
            style={{
              background:
                "radial-gradient(420px 320px at 60% 40%, color-mix(in oklab, var(--pbrand) 15%, transparent), transparent 70%)",
            }}
          />
          <div
            className="relative rounded-[20px] border border-[var(--w09)] bg-[var(--qcard)] p-[22px]"
            style={{ boxShadow: "0 30px 80px var(--sh50)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="size-[7px] rounded-full bg-[var(--pbrand)]" />
              <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[var(--pbrand)]">
                Q · Morning briefing
              </span>
            </div>
            <div className="flex items-center gap-[18px]">
              <div className="flex-1 text-[18px] font-bold leading-[1.3] tracking-[-.3px] text-[var(--qink)]">
                Good morning, Amina.{" "}
                <span className="text-[var(--pbrand)]">
                  3 things need your attention before 10:00.
                </span>
              </div>
              <div className="relative size-[86px] flex-none">
                <svg width="86" height="86" viewBox="0 0 86 86">
                  <circle
                    cx="43"
                    cy="43"
                    r="36"
                    style={{ fill: "none", stroke: "var(--w07)", strokeWidth: 7 }}
                  />
                  <circle
                    cx="43"
                    cy="43"
                    r="36"
                    transform="rotate(-90 43 43)"
                    style={{
                      fill: "none",
                      stroke: "var(--pbrand)",
                      strokeWidth: 7,
                      strokeLinecap: "round",
                      strokeDasharray: "163 999",
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[19px] font-bold leading-none text-[var(--qink)]">72</div>
                  <div className="text-[7.5px] tracking-[1.2px] text-[var(--ink4)]">HEALTH</div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-[9px]">
              {[
                { label: "On track", value: "15", color: "var(--ok)" },
                { label: "At risk", value: "6", color: "var(--warn)" },
                { label: "Overdue", value: "3", color: "var(--bad)" },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-[11px] border border-[var(--w07)] bg-[var(--w03)] px-3 py-[10px]"
                >
                  <div className="text-[9px] font-semibold uppercase tracking-[1.2px] text-[var(--ink4)]">
                    {k.label}
                  </div>
                  <div className="mt-[3px] text-[18px] font-bold" style={{ color: k.color }}>
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Overlapping Q reminder nudge */}
          <div
            className="relative -ml-[18px] -mt-[14px] w-[320px] rounded-[14px] border border-[var(--w10)] border-l-[3px] border-l-[var(--pbrand)] bg-[var(--card2)] px-[15px] py-[13px]"
            style={{ boxShadow: "0 18px 50px var(--sh55)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[.8px] text-[var(--pbrand)]">
              Reminder from Q
            </div>
            <div className="mt-1 text-[12px] leading-[1.5] text-[var(--ink2)]">
              Steering pack due at 10:00 — I&apos;ve drafted it. 25 minutes should cover your review.
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="q-features" className="mx-auto max-w-[1180px] px-6 pb-[30px] pt-[10px]">
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="q-card-hover rounded-[16px] border border-[var(--w07)] bg-[var(--qcard)] p-[22px]"
            >
              <div className="mb-[14px] grid size-[34px] place-items-center rounded-[11px] bg-[color-mix(in_oklab,var(--pbrand)_13%,transparent)]">
                {f.glyph}
              </div>
              <h3 className="mb-2 text-[15.5px] font-bold text-[var(--qink)]">{f.title}</h3>
              <p className="text-pretty text-[12.5px] leading-[1.6] text-[var(--ink4)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How Q works ────────────────────────────────────────── */}
      <section id="q-how" className="mx-auto max-w-[1180px] px-6 py-10">
        <div className="mb-7 text-center">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">
            How Q works
          </div>
          <h2 className="text-[28px] font-bold tracking-[-.6px] text-[var(--qink)]">
            Reminds. Organizes. Prioritizes.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3">
          {HOW.map((h) => (
            <div
              key={h.step}
              className="rounded-[16px] border border-[var(--w07)] bg-[var(--w02)] p-[22px]"
            >
              <div className="mb-[10px] font-mono text-[11px] font-bold text-[var(--pbrand)]">
                {h.step}
              </div>
              <p className="text-pretty text-[12.5px] leading-[1.6] text-[var(--ink35)]">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security band ──────────────────────────────────────── */}
      <section id="q-security" className="mx-auto max-w-[1180px] px-6 pb-[56px] pt-6">
        <div
          className="flex flex-wrap items-center gap-[26px] rounded-[18px] border border-[var(--w08)] px-7 py-[26px]"
          style={{
            background:
              "radial-gradient(800px 300px at 50% -100%, color-mix(in oklab, var(--pbrand) 12%, transparent), transparent 65%), var(--qcard)",
          }}
        >
          <div className="min-w-[280px] flex-1">
            <h3 className="mb-[7px] text-[18px] font-bold text-[var(--qink)]">
              Tenant-isolated by design
            </h3>
            <p className="text-pretty text-[12.5px] leading-[1.6] text-[var(--ink4)]">
              Every tenant&apos;s data is separated at the database row level. Role-based access
              hides what you can&apos;t act on, and every mutation is audited.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SECURITY_CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)] px-[13px] py-[6px] text-[11px] font-bold text-[var(--pbrand)]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ─────────────────────────────────────────── */}
      <footer className="border-t border-[var(--w06)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5 px-6 py-11">
          <div>
            <h3 className="mb-[5px] text-[20px] font-bold tracking-[-.4px] text-[var(--qink)]">
              Bring Q to your portfolio.
            </h3>
            <div className="text-[12px] text-[var(--ink5)]">© 2026 QUBIT · Enterprise PPM</div>
          </div>
          <Link
            href="/login"
            className="q-lift rounded-full bg-[var(--pbrand)] px-[24px] py-3 text-[13.5px] font-bold text-[var(--onbrand)]"
            style={{ boxShadow: PILL_SHADOW }}
          >
            Sign in to QUBIT
          </Link>
        </div>
      </footer>
    </div>
  );
}
