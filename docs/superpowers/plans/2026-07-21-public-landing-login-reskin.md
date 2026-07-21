# Public Landing + Login Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **UI/UX craft:** Every task that writes JSX/CSS MUST invoke the `impeccable` skill during its implementation step to elevate visual hierarchy, spacing, typography, motion, responsive behaviour, and accessibility. The JSX shown in this plan is a correct, runnable *baseline* (real tokens, real copy, real links) — impeccable refines the pixels; it does not re-architect the component or change its copy/links/tests.

**Goal:** Reskin QUBIT's public landing (`/`) to Anchor Pario v2's visual system and the login (`/login`) to Lumi AI's look, changing only presentation — no auth logic, data path, or tenant theming changes.

**Architecture:** The landing is decomposed into focused section components under `src/components/marketing/`, assembled by `src/app/page.tsx`. The login keeps `login-form.tsx`'s existing logic (NextAuth sign-in, TOTP MFA, email→tenant org lookup, quick sign-ins) and swaps only its layout/markup to Lumi's centred dark-gradient card. Both pages stay product-branded (QUBIT green) because they render before a tenant is known.

**Tech Stack:** Next.js 15 (App Router, RSC) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui + Radix · lucide-react · Vitest + React Testing Library.

## Global Constraints

- **Reference map (UI only):** landing ⇐ `~/Desktop/Anchor Pario v2/packages/frontend/src/pages/HomePage.tsx`; login ⇐ `~/Documents/Lumi AI/onenode/src/app/login/LoginClient.tsx`. `~/Documents/checksmart` and `~/Documents/swirra/swirra-frontend` are NOT used in this slice.
- **No new dependencies** (see `docs/03-dependencies.md`). Reuse existing tokens, keyframes, shadcn components, and `lucide-react`.
- **No fabricated social proof:** no invented statistics, testimonials, customer names, or dollar figures. The reference's stats band and testimonials sections are cut.
- **Product-branded, not tenant-branded:** use `var(--pbrand)` and existing neutral/semantic tokens; never `--rbrand`-vs-`--pbrand` forking on these public pages.
- **Preserve auth behaviour:** the login's NextAuth sign-in, TOTP MFA affordance, org lookup, and both quick sign-ins must remain functional.
- **TypeScript strict**, no `any` without a written reason. Files: kebab-case; components PascalCase.
- **Quality gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass. Renders correctly in **both** light and dark themes and down to mobile widths.
- **Tokens available (reuse, do not redefine):** `--qbg --qcard --card2 --qink --ink2 --ink35 --ink4 --ink5 --pbrand --onbrand --ok --warn --bad --blue --hair --hair2 --wash --w02…--w09 --glowA --sh50 --sh55`. Keyframes: `fadeUp`, `rise`, `pulseGlow`. Utility classes: `q-lift`, `q-card-hover`.
- **Test location/convention:** `tests/unit/<name>.test.tsx`, using `render`/`screen` from `@testing-library/react` and the `@/` path alias (mirrors `tests/unit/button.test.tsx`).

---

## File Structure

- Create: `src/components/marketing/hero.tsx` — hero band (badge, headline, subtitle, dual CTA, trust row).
- Create: `src/components/marketing/feature-grid.tsx` — 4-up capability cards.
- Create: `src/components/marketing/how-it-works.tsx` — 4 numbered steps.
- Create: `src/components/marketing/audience-split.tsx` — two audience panels.
- Create: `src/components/marketing/trust-band.tsx` — honest "Built for Riverbank Group & KCB Group".
- Create: `src/components/marketing/closing-cta.tsx` — closing call-to-action.
- Create: `src/components/marketing/site-footer.tsx` — footer (links + legal).
- Create: `src/components/marketing/marketing-header.tsx` — top nav (logo, anchors, theme toggle, sign-in).
- Modify: `src/app/page.tsx` — assemble the sections.
- Modify: `src/app/(auth)/login/login-form.tsx` — Lumi layout; logic unchanged.
- Create: `tests/unit/landing-page.test.tsx`, `tests/unit/login-form.test.tsx`.

Each marketing component is a **server component** (no client hooks) except where noted; `marketing-header.tsx` uses `ThemeToggle` (already a client component) so it stays server-safe by composing it.

---

## Task 1: Marketing header + hero

**Files:**
- Create: `src/components/marketing/marketing-header.tsx`
- Create: `src/components/marketing/hero.tsx`

**Interfaces:**
- Produces: `export function MarketingHeader(): JSX.Element` and `export function Hero(): JSX.Element` — no props; both link CTAs to `/login`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/landing-page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/marketing/hero";

describe("Hero", () => {
  it("shows the headline and a CTA that links to /login", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const ctas = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/login");
    expect(ctas.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/landing-page.test.tsx`
Expected: FAIL — cannot resolve `@/components/marketing/hero`.

- [ ] **Step 3: Implement `marketing-header.tsx`**

```tsx
import Link from "next/link";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const NAV = [
  { href: "#features", label: "Product" },
  { href: "#how", label: "How Q works" },
  { href: "#security", label: "Security" },
];

export function MarketingHeader() {
  return (
    <header className="mx-auto flex max-w-[1180px] items-center gap-[26px] px-6 py-[22px]">
      <Link href="/" className="flex items-center gap-[11px]">
        <QubitLogo square={9} gap={2.5} radius={2.5} />
        <span className="text-[16.5px] font-bold tracking-[2.5px] text-[var(--qink)]">QUBIT</span>
      </Link>
      <nav className="flex flex-1 justify-center gap-[22px]">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className="text-[12.5px] font-semibold text-[var(--ink35)] transition-colors hover:text-[var(--qink)]"
          >
            {n.label}
          </a>
        ))}
      </nav>
      <ThemeToggle />
      <Link
        href="/login"
        className="rounded-full border border-[var(--hair)] px-[18px] py-[9px] text-[12.5px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)]"
      >
        Sign in
      </Link>
      <Link
        href="/login"
        className="q-lift rounded-full bg-[var(--pbrand)] px-[18px] py-[9px] text-[12.5px] font-bold text-[var(--onbrand)]"
      >
        Get started
      </Link>
    </header>
  );
}
```

- [ ] **Step 4: Implement `hero.tsx`**

Baseline adapted from Anchor Pario's hero (animated blurred blobs, badge pill, underline-SVG headline, gradient-text line, dual CTA, honest trust row). Uses QUBIT tokens + copy.

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden px-6 pb-28 pt-16"
      style={{
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--pbrand) 13%, transparent), transparent 62%)",
      }}
    >
      {/* animated blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-16 top-16 size-72 rounded-full bg-[color-mix(in_oklab,var(--pbrand)_28%,transparent)] blur-3xl [animation:pulseGlow_2.4s_infinite]" />
        <div className="absolute right-16 top-40 size-72 rounded-full bg-[color-mix(in_oklab,var(--blue)_22%,transparent)] blur-3xl [animation:pulseGlow_2.4s_infinite_1s]" />
      </div>

      <div className="relative z-[1] mx-auto max-w-[900px] text-center [animation:fadeUp_.4s_ease]">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--qcard)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pbrand)] shadow-sm">
          <span className="size-2 rounded-full bg-[var(--pbrand)] [animation:pulseGlow_2.4s_infinite]" />
          Portfolio &amp; programme management, with a copilot
        </div>

        <h1 className="mx-auto mb-6 max-w-[820px] text-[44px] font-bold leading-[1.08] tracking-[-1.6px] text-[var(--qink)] md:text-[64px]">
          Intelligent Portfolio Management{" "}
          <span className="relative whitespace-nowrap text-[var(--pbrand)]">
            for the Modern Enterprise
            <svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 300 12" fill="none" aria-hidden>
              <path d="M2 10C100 2 200 2 298 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-[620px] text-pretty text-[17px] leading-[1.6] text-[var(--ink35)]">
          QUBIT unifies projects and programmes across every subsidiary and region — and Q, its
          built-in AI copilot, reminds, organizes and prioritizes so nothing slips.
        </p>

        <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="q-lift group inline-flex items-center gap-2 rounded-xl bg-[var(--pbrand)] px-8 py-4 text-[15px] font-bold text-[var(--onbrand)]"
          >
            Get started
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center rounded-xl border border-[var(--hair)] bg-[var(--qcard)] px-8 py-4 text-[15px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--pbrand)] hover:text-[var(--qink)]"
          >
            See how Q works
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-[12px]">
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
```

- [ ] **Step 5: Invoke `impeccable` to refine hero + header visuals** (hierarchy, blob motion, dark-mode contrast, mobile spacing). Do not change copy, links, or the exported signatures.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- tests/unit/landing-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/marketing/marketing-header.tsx src/components/marketing/hero.tsx tests/unit/landing-page.test.tsx
git commit -m "feat(landing): marketing header + hero (Anchor Pario visual system)"
```

---

## Task 2: Feature grid + how-it-works

**Files:**
- Create: `src/components/marketing/feature-grid.tsx`
- Create: `src/components/marketing/how-it-works.tsx`
- Modify: `tests/unit/landing-page.test.tsx`

**Interfaces:**
- Produces: `export function FeatureGrid(): JSX.Element` (section `id="features"`), `export function HowItWorks(): JSX.Element` (section `id="how"`).

- [ ] **Step 1: Add failing tests** (append to `tests/unit/landing-page.test.tsx`):

```tsx
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";

describe("FeatureGrid", () => {
  it("renders four capability cards", () => {
    render(<FeatureGrid />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });
});

describe("HowItWorks", () => {
  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByRole("heading", { name: /reminds\. organizes\. prioritizes\./i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -- tests/unit/landing-page.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `feature-grid.tsx`**

```tsx
import { Bell, ListOrdered, LayoutGrid, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: Bell, tone: "var(--pbrand)", title: "A briefing, not a backlog", body: "Q opens your day with the three things that matter — ranked, explained, and one click from action." },
  { icon: ListOrdered, tone: "var(--blue)", title: "Priorities with reasons", body: "Every task ranked by deadline, dependencies and risk — and Q shows its working, so you can trust the order." },
  { icon: LayoutGrid, tone: "var(--ok)", title: "Group to branch in two clicks", body: "Portfolio × subsidiary heatmaps, programmes, milestones and RAID — drill from group level to a single branch." },
  { icon: ShieldCheck, tone: "var(--warn)", title: "Governed by default", body: "Row-level tenant isolation, RBAC and a full audit trail — enterprise controls without the friction." },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1180px] px-6 py-20">
      <div className="mb-14 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pbrand)]">
          <span className="size-2 rounded-full bg-[var(--pbrand)]" />
          Core capabilities
        </div>
        <h2 className="text-[32px] font-bold tracking-[-.6px] text-[var(--qink)] md:text-[40px]">
          Why teams choose <span className="text-[var(--pbrand)]">QUBIT</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="q-card-hover group rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-8"
          >
            <div
              className="mb-6 grid size-14 place-items-center rounded-xl transition-transform group-hover:scale-110"
              style={{ background: `color-mix(in oklab, ${f.tone} 15%, transparent)` }}
            >
              <f.icon className="size-7" style={{ color: f.tone }} aria-hidden />
            </div>
            <h3 className="mb-3 text-[18px] font-bold text-[var(--qink)]">{f.title}</h3>
            <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink4)]">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement `how-it-works.tsx`**

```tsx
const STEPS = [
  { n: "1", title: "Reminds", body: "Deadline nudges, stale-invite chasers and slippage alerts arrive before things go red — never after." },
  { n: "2", title: "Organizes", body: "Q drafts your steering packs and status updates from live portfolio data — you review, not rewrite." },
  { n: "3", title: "Prioritizes", body: "Your task list is re-ranked as dependencies shift — with a “why” behind every position." },
  { n: "4", title: "Acts", body: "Approve, assign or escalate from the briefing — Q turns the recommendation into the next step." },
];

export function HowItWorks() {
  return (
    <section id="how" className="px-6 py-20" style={{ background: "var(--w02)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-14 text-center">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">How Q works</div>
          <h2 className="text-[32px] font-bold tracking-[-.6px] text-[var(--qink)] md:text-[40px]">
            Reminds. Organizes. Prioritizes.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[var(--pbrand)] text-[20px] font-bold text-[var(--onbrand)]">
                {s.n}
              </div>
              <h3 className="mb-2 text-[18px] font-semibold text-[var(--qink)]">{s.title}</h3>
              <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink4)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Invoke `impeccable`** to refine both sections (icon-tile balance, dark-mode surfaces, responsive columns). Keep copy/ids/signatures.

- [ ] **Step 6: Run to verify pass**

Run: `pnpm test -- tests/unit/landing-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/marketing/feature-grid.tsx src/components/marketing/how-it-works.tsx tests/unit/landing-page.test.tsx
git commit -m "feat(landing): feature grid + how-it-works sections"
```

---

## Task 3: Audience split + trust band + closing CTA + footer

**Files:**
- Create: `src/components/marketing/audience-split.tsx`
- Create: `src/components/marketing/trust-band.tsx`
- Create: `src/components/marketing/closing-cta.tsx`
- Create: `src/components/marketing/site-footer.tsx`
- Modify: `tests/unit/landing-page.test.tsx`

**Interfaces:**
- Produces: `AudienceSplit()`, `TrustBand()`, `ClosingCta()` (links to `/login`), `SiteFooter()` — all no-prop server components. `TrustBand` renders text containing "Riverbank" and "KCB".

- [ ] **Step 1: Add failing tests**:

```tsx
import { TrustBand } from "@/components/marketing/trust-band";

describe("TrustBand", () => {
  it("names both groups honestly and invents no statistics", () => {
    render(<TrustBand />);
    expect(screen.getByText(/riverbank group/i)).toBeInTheDocument();
    expect(screen.getByText(/kcb group/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail** — Run: `pnpm test -- tests/unit/landing-page.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `audience-split.tsx`**

```tsx
import Link from "next/link";
import { Check, Users, ClipboardList } from "lucide-react";

const EXEC = ["A single command center across every subsidiary", "RAG heatmaps from group down to one branch", "Steering packs drafted from live data", "Slippage surfaced before it turns red"];
const PM = ["One place for programmes, milestones and RAID", "Task priorities re-ranked with a “why”", "Deadline and stale-invite chasers handled by Q", "Every mutation captured in the audit trail"];

function Panel({ icon: Icon, title, items, tint }: { icon: typeof Users; title: string; items: string[]; tint: string }) {
  return (
    <div className="rounded-2xl p-8" style={{ background: `color-mix(in oklab, ${tint} 8%, var(--qcard))`, border: "1px solid var(--w07)" }}>
      <div className="mb-6 flex items-center gap-3">
        <Icon className="size-8" style={{ color: tint }} aria-hidden />
        <h3 className="text-[22px] font-bold text-[var(--qink)]">{title}</h3>
      </div>
      <ul className="mb-8 space-y-4">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[14px] text-[var(--ink2)]">
            <Check className="mt-0.5 size-5 flex-none text-[var(--ok)]" aria-hidden />
            <span className="text-pretty">{it}</span>
          </li>
        ))}
      </ul>
      <Link href="/login" className="q-lift inline-flex rounded-xl px-6 py-3 text-[14px] font-bold text-[var(--onbrand)]" style={{ background: tint }}>
        Sign in
      </Link>
    </div>
  );
}

export function AudienceSplit() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel icon={Users} title="For executives" items={EXEC} tint="var(--pbrand)" />
        <Panel icon={ClipboardList} title="For programme managers" items={PM} tint="var(--blue)" />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement `trust-band.tsx`** (honest replacement for the reference's fabricated stats/testimonials — no numbers):

```tsx
export function TrustBand() {
  return (
    <section id="security" className="mx-auto max-w-[1180px] px-6 py-16">
      <div
        className="rounded-2xl border border-[var(--w08)] px-8 py-12 text-center"
        style={{ background: "radial-gradient(800px 300px at 50% -100%, color-mix(in oklab, var(--pbrand) 12%, transparent), transparent 65%), var(--qcard)" }}
      >
        <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">Built for the group</div>
        <h2 className="mb-8 text-[26px] font-bold tracking-[-.5px] text-[var(--qink)] md:text-[32px]">
          Built for Riverbank Group &amp; KCB Group
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {["Row-level security", "RBAC", "TOTP MFA", "Full audit trail"].map((chip) => (
            <span key={chip} className="rounded-full bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)] px-[14px] py-[7px] text-[12px] font-bold text-[var(--pbrand)]">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement `closing-cta.tsx`**

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ClosingCta() {
  return (
    <section className="px-6 py-24" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--pbrand) 90%, #0b2239), color-mix(in oklab, var(--pbrand) 60%, #0b2239))" }}>
      <div className="mx-auto max-w-[820px] text-center">
        <h2 className="mb-6 text-[36px] font-bold leading-[1.1] tracking-[-1px] text-white md:text-[52px]">
          Bring Q to your portfolio.
        </h2>
        <p className="mb-10 text-[18px] leading-[1.6] text-white/85">
          Sign in to see your entire portfolio in one command center — with a copilot that keeps it moving.
        </p>
        <Link href="/login" className="group inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-[16px] font-bold text-[var(--pbrand)] transition-transform hover:scale-105">
          Sign in to QUBIT
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Implement `site-footer.tsx`**

```tsx
import Link from "next/link";
import { QubitLogo } from "@/components/brand/qubit-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--w06)] bg-[var(--qbg)] px-6 py-12">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-[11px]">
          <QubitLogo square={8} gap={2} radius={2} />
          <span className="text-[14px] font-bold tracking-[2px] text-[var(--qink)]">QUBIT</span>
        </div>
        <div className="text-[12px] text-[var(--ink5)]">© 2026 QUBIT · Enterprise Portfolio &amp; Programme Management</div>
        <Link href="/login" className="text-[12.5px] font-semibold text-[var(--pbrand)] hover:underline">Sign in</Link>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Invoke `impeccable`** across these four sections (panel balance, CTA contrast in both themes, footer rhythm). Keep copy/links/signatures.

- [ ] **Step 8: Run to verify pass** — Run: `pnpm test -- tests/unit/landing-page.test.tsx` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/marketing/audience-split.tsx src/components/marketing/trust-band.tsx src/components/marketing/closing-cta.tsx src/components/marketing/site-footer.tsx tests/unit/landing-page.test.tsx
git commit -m "feat(landing): audience split, honest trust band, closing CTA, footer"
```

---

## Task 4: Assemble the landing page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `tests/unit/landing-page.test.tsx`

**Interfaces:**
- Consumes: `MarketingHeader`, `Hero`, `FeatureGrid`, `HowItWorks`, `AudienceSplit`, `TrustBand`, `ClosingCta`, `SiteFooter`.
- Produces: default-exported `LandingPage()` RSC.

- [ ] **Step 1: Add the guardrail test** (enforces "no fabricated social proof"):

```tsx
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("assembles sections and contains no fabricated statistics or testimonials", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    // Fabricated markers from the Anchor Pario reference must NOT appear.
    for (const banned of ["$2.5B", "500+", "5K+", "98%", "Mary Kamau", "John Ochieng", "Verified Customer"]) {
      expect(text).not.toContain(banned);
    }
    // Honest trust band present.
    expect(screen.getByText(/built for riverbank group & kcb group/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail** — Run: `pnpm test -- tests/unit/landing-page.test.tsx` → FAIL (current `page.tsx` lacks the trust-band text / structure).

- [ ] **Step 3: Rewrite `src/app/page.tsx`**

```tsx
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { AudienceSplit } from "@/components/marketing/audience-split";
import { TrustBand } from "@/components/marketing/trust-band";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

// Public marketing landing. Product-branded green in both themes — never
// tenant-branded. `/` is a public route (see middleware.ts).
export const metadata = {
  title: "QUBIT — Your entire portfolio. One command center. One copilot.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--qbg)]">
      <MarketingHeader />
      <main>
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <AudienceSplit />
        <TrustBand />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test -- tests/unit/landing-page.test.tsx` → PASS (all describes).

- [ ] **Step 5: Typecheck + lint** — Run: `pnpm typecheck && pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx tests/unit/landing-page.test.tsx
git commit -m "feat(landing): assemble reskinned public landing from marketing sections"
```

---

## Task 5: Restyle login to Lumi's centred dark card (logic unchanged)

**Files:**
- Modify: `src/app/(auth)/login/login-form.tsx`
- Create: `tests/unit/login-form.test.tsx`

**Interfaces:**
- Unchanged export: `export function LoginForm({ callbackUrl }: { callbackUrl: string })`. All existing state, `handleSubmit`, org-lookup effect, `QUICK_SIGN_INS`, and TOTP handling are preserved verbatim; only the returned JSX (layout/classes) changes to Lumi's shell.

- [ ] **Step 1: Write the guardrail test** — protects preserved behaviour through the restyle:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

import { LoginForm } from "@/app/(auth)/login/login-form";

describe("LoginForm (restyled)", () => {
  it("keeps the sign-in fields, the MFA affordance, and both quick sign-ins", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(document.querySelector("#email")).toBeTruthy();
    expect(document.querySelector("#password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /enter authenticator code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /riverbank super admin/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kcb super admin/i })).toBeInTheDocument();
  });

  it("quick sign-in fills the email field", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /kcb super admin/i }));
    expect((document.querySelector("#email") as HTMLInputElement).value).toContain("@");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm test -- tests/unit/login-form.test.tsx`
Expected: FAIL — no `<h1>Sign in</h1>` is only reachable if imports resolve; the test fails initially because the file has not yet been confirmed to render under the mocks (run establishes the baseline; if it already passes on the current markup, that's acceptable — proceed, since Step 3 must keep it green).

- [ ] **Step 3: Replace the returned JSX with Lumi's shell.** Keep every line above `return (` unchanged. Replace the whole `return ( … )` block with:

```tsx
  return (
    <div
      className="relative min-h-screen w-full"
      style={{
        background: [
          "radial-gradient(ellipse 60% 50% at 15% 25%, rgba(11,34,57,0.85), transparent 60%)",
          "radial-gradient(ellipse 50% 50% at 85% 80%, color-mix(in oklab, var(--pbrand) 30%, transparent), transparent 65%)",
          "#050810",
        ].join(", "),
      }}
    >
      <ThemeToggle className="absolute right-[18px] top-[18px] text-white/70" />

      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]" style={formStyle}>
          <button type="button" onClick={() => router.push("/")} className="mb-6 flex items-center gap-[11px]">
            <QubitLogo square={9} gap={2.5} radius={2.5} color="var(--login-brand)" />
            <span className="text-[11px] font-bold uppercase tracking-[3px] text-white/70">QUBIT</span>
          </button>

          <h1 className="mb-1.5 text-[24px] font-semibold tracking-[-.4px] text-white">Sign in</h1>
          <p className="mb-6 text-[13px] text-white/55">Your organization is resolved from your email — no picker.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5" noValidate>
            <input id="email" type="email" autoComplete="email" required placeholder="you@company.com" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />

            {resolved && (
              <div
                className="flex items-center gap-[9px] rounded-[11px] px-[13px] py-[9px] [animation:rise_.3s_ease_both]"
                aria-live="polite"
                style={{ background: "color-mix(in oklab, var(--login-brand) 18%, transparent)", border: "1px solid color-mix(in oklab, var(--login-brand) 40%, transparent)" }}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-[var(--login-brand)] text-[9.5px] font-extrabold text-[var(--onbrand)]">
                  {org.tenantName.charAt(0).toUpperCase()}
                </span>
                <span className="text-[12px] text-white/80">Signing in to <span className="font-bold text-[var(--login-brand)]">{org.tenantName}</span></span>
              </div>
            )}
            {org.status === "not-found" && (
              <p className="rounded-[11px] border border-white/10 bg-white/[0.03] px-[13px] py-[9px] text-[12px] text-white/55" aria-live="polite">
                No organization found for that domain.
              </p>
            )}

            <input id="password" type="password" autoComplete="current-password" required placeholder="Password" className={INPUT_CLASS} value={password} onChange={(e) => setPassword(e.target.value)} />

            {showTotp ? (
              <input id="totpCode" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" className={INPUT_CLASS} value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
            ) : (
              <button type="button" onClick={() => setShowTotp(true)} className="self-start text-[11.5px] font-semibold text-white/55 transition-colors hover:text-[var(--login-brand)]">
                Enter authenticator code
              </button>
            )}

            {error && <p role="alert" className="text-[12px] text-[#ff8a8a]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-[11px] px-[13px] py-[13px] text-[13.5px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-[2px] disabled:opacity-60"
              style={{ background: "var(--login-brand)", boxShadow: "0 4px 20px color-mix(in oklab, var(--login-brand) var(--glowA), transparent)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 mb-2.5 flex items-center gap-2.5">
            <span className="flex-1 border-b border-white/10" />
            <span className="font-mono text-[8.5px] tracking-[1.8px] text-white/40">DEMO QUICK SIGN-IN</span>
            <span className="flex-1 border-b border-white/10" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {QUICK_SIGN_INS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}
                className="flex flex-1 items-center gap-2 rounded-[11px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-[11.5px] font-semibold text-white/80 transition-colors hover:border-[var(--login-brand)]"
              >
                <span className="flex size-5 flex-none items-center justify-center rounded-full text-[9.5px] font-extrabold text-white" style={{ background: d.brand }}>{d.initial}</span>
                {d.label}
              </button>
            ))}
          </div>

          <div className="mt-4 text-[11px] leading-[1.5] text-white/45">
            You may be asked for a 6-digit authenticator code. Trouble signing in? Contact your administrator.
          </div>
        </div>
      </main>

      {/* Giant faded background wordmark (Lumi motif) */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-between px-4 font-black uppercase leading-none text-white/[0.03]" style={{ fontSize: "clamp(44px, 11vw, 200px)" }}>
        {"QUBIT".split("").map((c, i) => (<span key={i}>{c}</span>))}
      </div>
    </div>
  );
```

Also update `INPUT_CLASS` (top of file) so field text/placeholder read on the dark card:

```tsx
const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-white/10 bg-white/[0.05] px-[14px] py-3 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-[color-mix(in_oklab,var(--login-brand)_60%,transparent)]";
```

- [ ] **Step 4: Invoke `impeccable`** to refine the login (card elevation, field focus rings, wordmark placement, small-screen padding). Must keep all ids, the `handleSubmit`/state wiring, and both quick sign-ins intact.

- [ ] **Step 5: Run tests to verify pass** — Run: `pnpm test -- tests/unit/login-form.test.tsx` → PASS (both cases).

- [ ] **Step 6: Typecheck + lint** — Run: `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/login/login-form.tsx" tests/unit/login-form.test.tsx
git commit -m "feat(login): restyle to Lumi centred dark card; auth logic unchanged"
```

---

## Task 6: End-to-end verification (both themes + live MFA path)

**Files:** none (verification only).

- [ ] **Step 1: Full quality gates** — Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 2: Run the app** — Run: `pnpm dev`, open `/`. Verify each section renders, CTAs navigate to `/login`, and the layout is responsive at 375px and 1280px widths. (Use the `run` skill / Playwright MCP for screenshots.)

- [ ] **Step 3: Theme check** — Toggle light/dark on both `/` and `/login`; confirm contrast holds (hero blobs, CTA band, dark login card, faded wordmark).

- [ ] **Step 4: Live login path** — On `/login`: type a tenant email, confirm the org-resolved chip appears; use a quick sign-in; complete sign-in including the **6-digit authenticator code** field; confirm redirect to `/dashboard`. This proves TOTP MFA and org lookup survived the restyle.

- [ ] **Step 5: No-regression sweep** — `git grep -n "riverbank.solutions\|swirra-frontend" src/` returns nothing new; no fabricated stats/testimonials present (Task 4 test covers this).

- [ ] **Step 6: Final commit (if any polish applied during verification)**

```bash
git add -A && git commit -m "chore(ui): verification polish for landing + login reskin"
```

---

## Self-Review

- **Spec coverage:** landing→Anchor Pario (Tasks 1–4), login→Lumi (Task 5), product-branded/no tenant fork (tokens used are `--pbrand`/neutral only), fabricated content cut + honest trust band (Task 3 + Task 4 guardrail test), no new deps (lucide + existing tokens only), auth logic preserved (Task 5 keeps logic; Task 6 Step 4 verifies MFA), both themes + responsive (Task 6). Covered.
- **Placeholder scan:** every code step contains full JSX/TS; no TBD/TODO; impeccable steps are explicit named actions with guardrails, not deferred work.
- **Type consistency:** `LoginForm({ callbackUrl })` signature unchanged; all marketing components are no-prop `() => JSX.Element`; section `id`s (`features`, `how`, `security`) match `marketing-header.tsx` nav anchors.
