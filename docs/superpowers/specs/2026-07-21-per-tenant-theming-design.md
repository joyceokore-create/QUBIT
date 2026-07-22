# Per-tenant theming — KCB + Riverbank

**Date:** 2026-07-21
**Branch:** `nancys_ui-fixes`
**Status:** Draft for review
**Scope:** UI/UX only — no application logic, data, routes, or RBAC touched.

---

## 1. Goal

Give each tenant its own visual identity, scoped so the two never bleed into each
other and neither disturbs the pre-auth / product-default look:

- **Riverbank** — a full re-skin from the Riverbank Solutions Style Guide v1.0:
  white / cool-charcoal surfaces, the `#ED1C24` red brand, guide status ramps, and
  Plus Jakarta Sans + Inter typography.
- **KCB** — font + logo + brand colors only, over its **existing** warm-paper
  surfaces: Lufga typeface, the KCB logo in chrome, and official green `#84BD00` /
  blue `#002B4D` brand tokens.
- **Pre-auth / default** (login, marketing, onboarding — everything outside the
  `(app)` group) — unchanged QUBIT identity (warm paper, product green,
  Archivo / Instrument Sans / IBM Plex Mono).

This spec delivers the **theming foundation + chrome**: the scoping mechanism, the
per-tenant token layers, font wiring, primitive ramps, and the topbar/logo. Redesigning
individual screens' layout and typography is follow-on work that builds on this
foundation, done incrementally as part of the branch's UI fixes — not a blanket restyle
in this pass.

## 2. Non-goals / constraints

- **No framework migration.** The pasted "stack" doc named Next 16, MUI v9 + Emotion,
  and SWR; the repo actually runs **Next 15.5.19**, `@base-ui/react`, and
  `@tanstack/react-query`. We follow that doc's *design conventions* (Tailwind v4
  `@theme` tokens, CSS-custom-property light/dark theming via `next-themes`, two-axis
  semantic colors, WCAG contrast, Recharts + Lucide) but build on what is installed.
  Swapping frameworks would be logic-heavy and is explicitly out of scope.
- **No component logic changes** beyond two presentational edits (the `data-tenant`
  attribute in the app-shell and the tenant logo swap in the topbar).
- **Semantic RAG/status colors** for KCB stay as they are today. Riverbank adopts the
  guide's status ramps.
- **Accessibility.** Every derived text pairing must be contrast-checked (≥4.5:1 body,
  ≥3:1 large/UI) before it ships. Values the guide already verified are cited as-is;
  KCB green-derived values are targets to pin during implementation.

## 3. Architecture

### 3.1 Scoping hook — one attribute, already wired

The `.app-shell` wrapper in [`src/app/(app)/layout.tsx`](../../../src/app/(app)/layout.tsx)
already sets `--brand` per tenant from `session.user.tenantSlug`. We add a
`data-tenant` attribute on the same element:

```tsx
<div
  data-tenant={session.user.tenantSlug}          // "kcb" | "riverbank" | …
  style={brandStyle}
  className="app-shell relative isolate min-h-screen bg-background"
>
```

All tenant overrides in `globals.css` are then scoped:

```css
[data-tenant="riverbank"] { /* light values */ }
.dark [data-tenant="riverbank"] { /* dark values */ }
[data-tenant="kcb"] { /* light values */ }
.dark [data-tenant="kcb"] { /* dark values */ }
```

No `data-tenant` (pre-auth, or an unknown tenant) → the existing `:root` / `.dark`
defaults render unchanged.

### 3.2 Why overriding source tokens is enough

`globals.css` already aliases the shadcn semantic vars (`--background`, `--card`,
`--primary`, `--border`, …) and the legacy design-system vars (`--brand`, `--ink`, …)
onto the raw `--q*` source tokens (`--qbg`, `--qcard`, `--qink`, `--brand`, `--ok`, …).
Because those aliases resolve *through* the source tokens at runtime, redefining the
source-token **values** inside a `[data-tenant]` block re-skins every component that
consumes them — exactly the mechanism `.dark` already uses. **Zero component edits, no
logic touched.**

### 3.3 Dark mode

`next-themes` is configured `attribute="class"` (`.dark`), `defaultTheme="dark"`,
`enableSystem={false}`. The guide's `[data-theme="dark"]` selector and
`setAttribute('data-theme', …)` snippet do **not** apply here — dark values live under
`.dark [data-tenant="…"]`.

## 4. Riverbank token layer (from the guide)

All values are the guide's; the guide's contrast table already verifies them. We
redefine the source tokens under the Riverbank scope.

### Light — `[data-tenant="riverbank"]`

| Source token(s) | Value | Guide role |
|---|---|---|
| `--qbg`, `--drawer`, `--menu` | `#ffffff` | surface-page / raised / overlay |
| `--qcard` | `#ffffff` | surface-raised |
| `--card2`, `--elev` | `#f8f8f8` / neutrals | subtle / elevation |
| `--qink` | `#231f20` | text-primary |
| `--ink2 … --ink6` | `#2b2b2b`,`#4b4b4b`,`#5b5b5b`,`#6b6b6b`,`#9f9f9f`,`#c4c4c4` | neutral text ramp |
| `--brand`, `--onbrand` | `#ed1c24`, `#ffffff` | primary fill + label |
| `--accent-foreground`, brand-as-text | `#c9181f` (primary-600) | text-brand / links (AA on white) |
| `--ring` | `#ed1c24` | focus/selected |
| `--ok`/`--okbg` | `#16a34a` / `#dcf1e4` | success |
| `--warn`/`--warnbg` | `#d97706` / `#f9ebda` | warning |
| `--bad`/`--badbg` | `#dc2626` / `#fadede` | error |
| `--qinfo`/`--infobg` | `#2563eb` / `#dee8fc` | info |
| `--border`, `--input` | `#e9e9e9` / `#dadada` (neutral-100/200) | borders |

### Dark — `.dark [data-tenant="riverbank"]`

Guide's "soft dark" elevation ramp (deeper = darker; no pure black):

| Source token(s) | Value | Guide role |
|---|---|---|
| `--qbg` | `#191616` (dark-700) | surface-page |
| `--qcard` | `#1e1a1b` (dark-600) | surface-raised |
| `--card2` | `#131112` (dark-800) | subtle/recessed |
| `--drawer`, `--menu`, `--elev` | `#231f20` (dark-500) | overlay |
| `--qink` | `#ffffff` | text-primary |
| `--ink2/3/4` | `#deddde`,`#a7a5a6`,`#706d6e` | text ramp |
| `--brand`, `--onbrand` | `#ed1c24`, `#ffffff` | primary fill + label (guide keeps brand red) |
| `--accent-foreground`, brand-as-text | `#f36b71` (primary-400) | text-brand / links (~4.8:1 on dark-700) |
| `--ok`/`--warn`/`--bad`/`--qinfo` | `#6dd49a` / `#f4b96a` / `#f08080` / `#7eaaff` (300 steps) | status text on dark |
| `--border`, `--input` | `#1e1a1b` / `#231f20` | borders |

## 5. KCB token layer (font + logo + colors only)

KCB keeps its current warm-paper surfaces and inks. We override **only** the brand
family + secondary, using a two-tier model for accessibility (bright `#84BD00` is unsafe
as small text and needs dark text on fills).

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--brand` (fill) | `#84BD00` | `#84BD00` | official KCB green |
| `--onbrand` (label on green) | `#002B4D` | `#002B4D` | KCB navy on green ≈ 7.6:1 (AAA); alt = near-black. **Confirm at build.** |
| brand-as-text (`--accent-foreground`, links) | darkened green ~`#3B6600` | `#84BD00` | **target — pin exact value ≥4.5:1 on warm paper (`#f1efe9`) at build** |
| `--brand2` (secondary) | `#002B4D` | lightened blue for any text use | topbar + secondary accents |

Semantic RAG (`--ok/--warn/--bad/--qinfo`) unchanged for KCB.

## 6. Typography

### 6.1 Font indirection (keeps both tenants safe)

Introduce intermediate vars in `:root`, default to QUBIT fonts, repoint per tenant.
`@theme` is already declared `inline`, so it emits `var()` references — runtime overrides
work.

```css
:root {
  --font-display: var(--font-archivo);      /* headings / wordmark */
  --font-body:    var(--font-instrument);   /* body / UI */
  --font-num:     var(--font-plex);         /* tabular default */
}
@theme inline {
  --font-sans:    var(--font-body);
  --font-heading: var(--font-display);
  --font-mono:    var(--font-plex);
  --font-data:    var(--font-num);          /* NEW utility: font-data */
}
[data-tenant="kcb"]       { --font-display: var(--font-lufga);   --font-body: var(--font-lufga); }
[data-tenant="riverbank"] { --font-display: var(--font-jakarta); --font-body: var(--font-jakarta); --font-num: var(--font-inter); }
```

### 6.2 Loading (root layout)

Add to [`src/app/layout.tsx`](../../../src/app/layout.tsx) — loading a font ≠ applying it;
application is purely via the CSS vars above.

- **Lufga** — `next/font/local`, the 7 `.woff` in `src/assets/KCB/`
  (Light→300, Regular→400, Medium→500, SemiBold→600, Bold→700, ExtraBold→800, Black→900),
  `variable: "--font-lufga"`.
- **Plus Jakarta Sans** — `next/font/google`, weights 400–800, `variable: "--font-jakarta"`.
- **Inter** — `next/font/google`, weights 400/500/600, `variable: "--font-inter"`,
  used with `font-variant-numeric: tabular-nums` / `"tnum"` for financial figures.

All `.variable` classes are appended to the existing `<body>` className.

### 6.3 Type scale + primitive ramps (utilities)

Add the guide's `fontSize` tokens (`display-2xl … data-xs`) and color primitive ramps
(`--color-primary-50…950`, `--color-dark-*`, `--color-neutral-*`, status steps) into
`@theme` so utilities like `text-display-xl`, `bg-primary-500`, `text-neutral-500` exist.
These are global *utilities*, but components reference **semantic tokens**, not primitives
(guide rule), so KCB is unaffected; the primitive ramp is intended for Riverbank-scoped
UI. Applying the scale to specific screens is incremental follow-on work.

## 7. Chrome

- **Topbar** ([`src/components/layout/topbar.tsx`](../../../src/components/layout/topbar.tsx)):
  - Gradient (`--topbar`) becomes per-tenant via tokens — KCB **navy → green**,
    Riverbank **charcoal → red**.
  - **Logo swap** (presentational): `data-tenant="kcb"` → `kcb-logo.svg`; Riverbank →
    keep the current `<QubitLogo>` + "QUBIT" wordmark as placeholder (no asset yet).
- Glass/ambient treatment keeps working unchanged (reads `--brand`).

## 8. Files touched

| File | Change | Kind |
|---|---|---|
| `src/app/globals.css` | primitive ramps + `font-data`/font indirection in `@theme`; `[data-tenant]` override blocks (Riverbank full, KCB brand) | CSS only |
| `src/app/layout.tsx` | load Lufga (local) + Jakarta + Inter; append `.variable` classes | UI |
| `src/app/(app)/layout.tsx` | add `data-tenant={tenantSlug}` to `.app-shell` | UI (1 attr) |
| `src/components/layout/topbar.tsx` | per-tenant logo swap | UI (presentational) |

No changes to server code, Prisma, routes, RBAC, or data.

## 9. Deferred / flagged

- **Riverbank logo** — `src/assets/Riverbank/` is empty. QUBIT wordmark is the
  placeholder until an asset is provided; I will not fabricate a logo.
- **Per-tenant favicon** — KCB ships `kcb-fav.svg`, but swapping favicon per tenant
  post-auth needs dynamic `metadata` (arguably logic, and low-value); tracked as a small
  follow-up, not part of this token pass.
- **Per-screen redesign** — layout/typography application to individual screens is
  incremental follow-on work on top of this foundation.
- **Guide nits to pin** — the guide has three trivial internal inconsistencies we
  resolve when transcribing: an unused `--color-surface-subtle: #f5f5f5` that
  contradicts `--surface-subtle` (use neutral-50 `#f8f8f8`); a dark-mode error
  `border-left: error-400` that is never defined (use `error-500`); and `overline`
  letter-spacing listed blank in §1 but `0.08em` in the config (use `0.08em`).

## 10. Verification

- **Contrast:** compute and record ratios for the KCB green-as-text and on-green pairs
  (warm-paper `#f1efe9` light, `#151110` dark); cite the guide's verified Riverbank pairs.
- **Visual smoke test:** sign in as KCB (`daniel.kiptoo@kcb.example.invalid`) and
  Riverbank (`joyce.okore@riverbank.solutions`), toggle light/dark, confirm each tenant
  renders its own palette + font + logo and the *other* tenant + pre-auth are unchanged.
- **No-logic guarantee:** `git diff` limited to the four files in §8; no `src/server`,
  `src/lib`, `prisma`, or route files.
