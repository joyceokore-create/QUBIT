# Design — Public landing + login reskin

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Author:** Nancy Wanjiru (with Claude)

## Summary

Reskin QUBIT's two **public, pre-authentication** routes to adopt external visual
references, without changing any behaviour, data path, auth logic, or tenant theming:

- **`/` (marketing landing)** → adopt the visual system of **Anchor Pario v2**
  (`~/Desktop/Anchor Pario v2/packages/frontend/src/pages/HomePage.tsx`, the `@swirra/frontend`
  package).
- **`/login`** → adopt the visual look of **Lumi AI / OneNode**
  (`~/Documents/Lumi AI/onenode/src/app/login/LoginClient.tsx`).

Both pages remain **product-branded** (QUBIT green), never tenant-branded — consistent with the
existing note in `src/app/page.tsx`. Per-tenant design languages (KCB→Lumi, Riverbank→checksmart)
are explicitly **out of scope** for this slice; that divergence begins after login and will be
designed separately (see "Future work").

## Reference map (avoid cross-referencing the wrong folder)

Focus is **UI/UX only**. Exactly two references are active for this slice.

| Target in QUBIT | Active reference | Path |
|---|---|---|
| `/` landing | **Anchor Pario v2** (`@swirra/frontend`) | `~/Desktop/Anchor Pario v2/packages/frontend` |
| `/login` | **Lumi AI / OneNode** | `~/Documents/Lumi AI/onenode` |

**Parked — NOT used in this slice** (reserved for the later post-login, per-tenant work):

| Folder | Path | Belongs to |
|---|---|---|
| checksmart | `~/Documents/checksmart` | Riverbank app design (future) |

`~/Documents/swirra/swirra-frontend` is **not a reference** and is not used anywhere in this
project — do not consult it.

## Why this scope

Landing and login run before a tenant is known, so they cannot be tenant-forked. They are a
single product-branded look for everyone, have no data/RLS dependencies, and QUBIT already ships
both routes — making this a clean, self-contained first slice (a reskin, not new surface).

## Key decisions

1. **Port layout & style; keep QUBIT's own content.** Anchor Pario's copy is Swirra procurement
   content (vendor registration, "500+ organizations in Kenya", named testimonials, dollar
   stats). We reproduce its *visual system* only, populated with QUBIT's real product messaging
   (portfolio command centre, the Q copilot, group→branch drill-down).

2. **No fabricated social proof.** Per organization content rules, we do **not** invent
   testimonials, customer names, or statistics. The fabricated **stats band** and **testimonials
   section** from the reference are **cut**. In their place, an honest **"Built for Riverbank
   Group & KCB Group"** trust band is added. All other sections are kept.

3. **Login = Lumi's shell, QUBIT's brains.** We adopt Lumi's dark radial-gradient canvas
   (navy → green over near-black), centred card, eyebrow/title/subtitle, field styling with a
   show/hide password toggle, full-width submit button, and the large faded background wordmark
   (set to "QUBIT"). We **keep QUBIT's existing auth behaviour unchanged**: NextAuth sign-in,
   **TOTP MFA**, email→tenant org lookup, and the two tenant quick-sign-in shortcuts. Removing
   these would violate security-by-design. Lumi supplies the face; QUBIT's security stays intact.

4. **No new dependencies.** Everything maps onto QUBIT's existing stack.

## Stack mapping

| Reference uses | QUBIT equivalent |
|---|---|
| Radix + Tailwind + CVA (Anchor Pario) | Same — shadcn/ui already present |
| `@heroicons/react` | `lucide-react` (map icon-for-icon) |
| Tailwind 3 `primary-*` / `accent-*` colour scales | QUBIT tokens: `--pbrand` green + a derived `accent` scale; Tailwind 4 |
| Lumi MUI `Card` / `Button` | QUBIT shadcn `Card` / `Button` |
| Lumi green `#84bd00` / navy `#003057` | QUBIT `--pbrand` green + existing navy from `--topbar` gradient |

## Landing page composition (`/`)

Reproduce Anchor Pario's HomePage section order and visual treatment, with QUBIT content:

1. **Hero** — gradient background with animated blurred colour blobs, a status badge pill,
   large headline with an underline-SVG accent and a gradient-text line, subtitle, dual CTAs
   (primary → `/login`, secondary → contact/learn-more), and a row of honest trust indicators.
2. **Features** — 4-up card grid (hover lift, gradient icon tiles) describing QUBIT capabilities.
3. ~~Stats band~~ — **cut** (fabricated). Replaced by the trust band (below).
4. **How it works** — 4 numbered steps.
5. **Split panels** — two audience-oriented panels (e.g. Executives / Programme managers),
   reframed from the reference's Vendors/Organizations split.
6. ~~Testimonials~~ — **cut** (fabricated).
7. **Trust band** — honest "Built for Riverbank Group & KCB Group" section (optional logos).
8. **CTA** — closing gradient call-to-action into `/login`.
9. **Footer** — QUBIT footer (links, legal); no Swirra addresses or copy carried over.

Sections likely extracted into `src/components/marketing/*` for readability.

## Login page (`/login`)

- Restyle only. Lumi's dark radial-gradient `Shell`, centred `max-w-md` card, eyebrow ("QUBIT"),
  "Sign in" heading, muted subtitle, email + password inputs with show/hide toggle, full-width
  submit, forgot-password link, and the faded full-bleed background wordmark.
- **Logic unchanged**: `login-form.tsx` keeps NextAuth sign-in, TOTP MFA step, email→tenant
  org lookup, and tenant quick-sign-ins. Only markup/classes change.

## Files touched

- `src/app/page.tsx` — rebuild landing in Anchor Pario's layout; extract sections to
  `src/components/marketing/*`.
- `src/app/(auth)/login/login-form.tsx` — restyle to Lumi's shell; behaviour unchanged.
- `src/app/globals.css` — add any `accent`-scale tokens the landing needs (no brand changes).
- No API, DB, Prisma, RLS, or middleware changes. No new dependency.

## Out of scope / future work

- Per-tenant design languages after login (Approach B): KCB → Lumi AI look, Riverbank →
  checksmart look, resolved from a tenant design bundle. Separate spec.
- Pilot reskin of the app shell + dashboard under that per-tenant model.

## Build approach (skills)

- **superpowers** orchestrates the process: brainstorming (this spec) → writing-plans →
  executing-plans, with review checkpoints.
- **impeccable** (frontend-design) drives the UI/UX craft at *implementation* time — visual
  hierarchy, spacing, typography, motion, responsive behaviour, light/dark theming, a11y.
  It is invoked when we start building each page, not during planning.

## Verification (Definition of Done)

- Renders correctly in **both light and dark** themes.
- Login completes end-to-end **including TOTP MFA** and org lookup — verified by running it,
  not assumed.
- `pnpm lint` and `pnpm typecheck` pass.
- Responsive to mobile widths.
- No secrets or PII committed; no fabricated statistics, testimonials, or customer names.
- No change to tenant theming, auth logic, or any data path.
