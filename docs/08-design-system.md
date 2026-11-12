# 08 — Design System

The visual North Star is `qubit_exec_dashboard.html`. Reproduce its look with Tailwind + CSS
variables, but make the **brand colour a per-tenant token** so Riverbank renders red and any
renders red without any other change.

## Brand tokens (per tenant)

The tenant record supplies `--brand` and `--brand-light`. The authenticated layout injects them
as inline CSS variables on a wrapper element; everything else references the variables.

| Token | Product default | Riverbank Group | Role |
|-------|-----------|-----------------|------|
| `--brand` | `#1B7A3E` | `#ED1C24` | primary actions, active nav, accents |
| `--brand-mid` | `#2EA055` | `#F4434A` | hover on primary |
| `--brand-light` | `#E8F5EE` | `#FDECEC` | active nav bg, subtle fills |

## Fixed tokens (both tenants)

```css
--bg:#F5F5F3; --white:#FFFFFF;
--ink:#0D0D0D; --ink2:#4A4A4A; --ink3:#8A8A8A; --ink4:#C8C8C8;
--amber:#D97706; --amber-bg:#FEF3C7;   /* At Risk */
--red:#DC2626;   --red-bg:#FEE2E2;      /* Overdue */
--blue:#1D4ED8;  --blue-bg:#DBEAFE;     /* Planning / info */
--green-status:#1B7A3E;                 /* On Track (semantic, not brand) */
--green-status-bg:#DCFCE7;              /* On Track pill bg — added at Milestone 4, this
                                            list originally omitted the On Track counterpart
                                            to amber-bg/red-bg/blue-bg below */
--r:10px; --r-sm:6px;
--shadow:0 2px 8px rgba(0,0,0,.07),0 1px 2px rgba(0,0,0,.05);
--shadow-lg:0 8px 32px rgba(0,0,0,.13),0 2px 6px rgba(0,0,0,.07);
```

> Important: **RAG status colours are semantic and DO NOT change per tenant.** On Track is
> always green, At Risk amber, Overdue red, Planning blue. Only the *brand* accent (nav,
> buttons, links) swaps. For the product default the brand green and the On-Track green coincide; for Riverbank
> they intentionally differ (red brand, green "On Track") — keep them as separate tokens.

## Typography

- **Body:** Inter (300–700). Base size 13px, line-height 1.5.
- **Display/headings:** Syne (600–800), tight letter-spacing (e.g. `-0.5px`).
- Load via `next/font/google`.

## Status → colour mapping

| Status | Text/accent | Background pill |
|--------|-------------|-----------------|
| On Track | `--green-status` | light green (`#DCFCE7`) |
| At Risk | `--amber` | `--amber-bg` |
| Overdue | `--red` | `--red-bg` |
| Planning | `--blue` | `--blue-bg` |

Milestone chip states: `done` (✓ green), `active` (▶ amber), `late` (! red), `pending` (○ grey).

## Controls, tabs, status and dates (UX simplification, Nov 2026)

These rules come from the UX simplification plan (U1–U5, U8, D8a, D8c). The tokens live at the
end of `src/app/globals.css`; the shared pieces are listed beside each rule.

**Controls (U3).** Search fields, filter dropdowns, inputs, selects and default buttons share
one size: `--control-h` (36px, `h-9`) and `--control-r` (10px, `--radius`). Filters are **not
pills**: they use the input radius. Buttons come in two sizes only: default, and compact
`--control-h-compact` (28px) for actions inside table rows and list items. The primary action
is filled brand with white text (drawer footers too), secondary actions are outlined, and a
page has at most one primary button, in the header at the top right. Shared: `Button`
(`default` / `sm`), `PRIMARY` / `SECONDARY` in `src/lib/surface.ts`.

**Tabs (U1).** No line across the full width. Each tab is its own block with rounded top
corners; the active tab gets a fill and a 2px brand border under that tab only. The fill is
the card colour on the grey page and `--surface-2` inside a white card. Inactive tabs are plain
text with an optional count. Shared: `TabStrip` (`src/components/ui/tab-strip.tsx`, URL-driven)
and the `Tabs` default variant; class constants `TAB`, `TAB_ACTIVE`, `TAB_ACTIVE_ON_CARD`,
`TAB_COUNT`.

**Inputs (U2).** Every input has a label above it and a placeholder inside that gives a short
example. Rules and format requirements go in helper text under the field, never only in the
placeholder. Placeholder text meets 4.5:1.

**Status words and stage colours (D8a, U4).** Health reads **On track / At risk / Off track**
(never "Green / Amber / Red" as the label), always as a word, on a 12% wash of its ink:
`--ok-ink`, `--warn-ink`, `--bad-ink` (≥ 4.5:1 in both themes; Riverbank's `--warn` #d97706 is
only 3.2:1 as text, so pills use `--warn-ink`). Lifecycle stages have their own colours:
Intake `--stage-intake` (grey) · Exploring `--stage-exploring` (blue) · Evaluating
`--stage-evaluating` (violet) · Approved `--stage-approved` (teal) · Live `--stage-live`
(green). Amber, red and green stay reserved for health. Shared: `HealthPill`, `StagePill`
(`src/components/ui/status-pill.tsx`), `healthWord()` (`src/lib/status-words.ts`).

**KPI cards (U8).** The standard white card: label → figure (+ unit) → optional context line →
optional small chart. The change against the last period sits at the top right on the label's
line ("+1 vs last week", "Same as last week"), coloured only when good or bad. No space is
reserved for a missing chart. Shared: `KpiCard` (`src/components/ui/kpi-card.tsx`).

**Dates (U5).** One format everywhere: "9 Nov 2026", "9 Nov", "Fri 13 Nov, 17:00", 24-hour
times, in the **tenant's time zone** (`Tenant.timeZone`, default Africa/Nairobi), never the
server's or the browser's. "Today" and "overdue" compare tenant-local calendar days. Shared:
`src/lib/dates.ts`.

**Sign-in (D8c).** Two panels on the card surface with no divider: a 3D illustration with a
heading and one sentence on the left (hidden below `lg`), the form in a shadowed card on the
right with the logo above and a footer below. One step per screen (work email → password →
authenticator code), each with its own illustration (`public/login/`). Shared: `AuthShell`
(`src/components/auth/auth-shell.tsx`).

### List pages (UX5)

Every list page: `PageHeader` (title, one-line description, actions top right; the page's
main action is its one filled primary) → optional URL tabs (`TabStrip`) → toolbar (search on
the left with a placeholder saying what it searches, then filters as chip dropdowns, then an
inline "Clear All" when more than one filter is on — see Design spec v2 › Toolbar) → `TableCard`
holding only the table, its empty state and the always-visible `TableFooter` ("Showing 1–10
of 48", rows per page 5/10/25/50/100, Previous / pages / Next). All view state is in the URL
(`useListUrl`); rows per page is remembered per table. Empty states say why: "No risks match
these filters · Clear filters" vs "No risks yet". Components: `src/components/list/`; rules:
`src/lib/list-state.ts`.

### Daily Brief (UX4)

The one bold element on a home page. A solid `--brief-bg` surface (no gradient) with white text
at full opacity, footer included (Riverbank `#a3161c`, 7.8:1). At most three lines, each clamped
to two text lines, ranked Needs action now → Waiting on you → For your information. "View N more"
sits top right only when N > 0 and opens the full Brief in the right-hand drawer (full screen on
phones). Each line ends with its action link. With nothing to say it shows one line: "Nothing
needs your attention right now." Component: `src/components/dashboard/daily-brief.tsx`; rules:
`src/lib/daily-brief.ts`.

## Design spec v2 — UX fidelity (Nov 2026)

**Scope and precedence.** This section is the spec for the **new Riverbank layout** (per-role
homes, `ui_mode = new`). Where it disagrees with an older section of this file (fixed tokens,
Syne headings, 54px top bar, 216px sidebar, 660px panel, the core components table), **this
section wins** for the new layout; the older sections describe the classic layout. Source: the
approved role-journeys design (`mwashukes-desk/assets/role-journeys/qubit-role-journeys.html`,
published as the "QUBIT Role Journeys" artifact). Where the design redefines a screen, the last
definition wins (walkthrough → overrides → patches → views). Tokens:
`src/styles/design-spec.css` (`--ds-*`, Tailwind `bg-ds-*` / `text-ds-*`); contrast is enforced
by `tests/unit/design-spec-contrast.test.ts`.

### Deviations from the design (deliberate, recorded)

| # | Design | Built | Why |
|---|---|---|---|
| 1 | Status text in its base hue (#16a34a, #d97706, #dc2626, #2563eb, #0f8b8d) | Light mode: `--ds-*-text` (#166534, #92400e, #b91c1c, #1d4ed8, #6d28d9, #0f766e); dark mode: the design's hues | Base hues are 2.9–4.5:1 as text on their washes (green 3.3:1 and amber 3.2:1 even on white). Fills, meters, RAG bars and gate cells keep the design's hues. |
| 2 | Sidebar group labels at 42% white | 55% white | 42% is 3.4–4.1:1 on the sidebar gradient; 55% is 5.0–6.2:1. |
| 3 | `--ink4` (#9f9f9f) for placeholders, group headings (`.grp`), pager ellipsis, "or" divider, sign-in footer | `--ds-ink3` for any **text**; `--ds-ink4` for decoration only (dividers, disabled, chart axes, decorative arrows) | #9f9f9f is 2.65:1. ink3 is ≥ 4.88:1 on every surface. |
| 4 | Primary fill #ED1C24, white text | **Kept** (both themes; the design's dark-mode #f0353c is not used) | Riverbank brand colour — designer's decision, 11 Nov 2026. White on #ED1C24 is 4.38:1, just under AA: the one accepted exception. Keep button text white at weight 600 or bolder, never smaller than 12.5px on red; hover/pressed go darker (`--ds-brand-ink` #c9181f, 5.8:1), never lighter. |
| 5 | Sentence case labels | **Title Case labels** (see Casing) | Designer's decision, 11 Nov 2026. |
| 6 | No phone layouts | Must work at 390px; not required to match | The design is desktop-only. |
| 7 | Page background #f3f5f8 / dark #020617, ambient glow | **#fafafa** light, **#01030a** dark; **only the brand-red glow** (navy and green dropped) | Designer's decision, 12 Nov 2026: a lighter (and in dark, deeper) page so grey chips and tab counts read without adding borders. ink3 text on #fafafa is 5.1:1. |
| 8 | Table header 11px/700 ink3 on `--surface2`, cells 10px | Header **12.5px/600 ink2** on its own **`--ds-thead`** (#edeff2; dark #1b2a44), padding 11×14; cells **14px padding, 13px text** | Designer, 12 Nov 2026: tables felt cramped, and the header must differ from the row hover (`--ds-surface2`). ink2 on #edeff2 is 7.6:1. |

### Tokens

| Design | Token | Light | Dark | Use |
|---|---|---|---|---|
| `--brand` | `--ds-brand` | #ED1C24 | #ED1C24 | primary fill, active tab underline, focus ring, current OTP box |
| `--brand-ink` | `--ds-brand-ink` | #c9181f | #ff8a8f | red **text**: links, active counts, active filter chip, Clear all, Brief drawer title; primary hover (light) |
| `--brand-wash` | `--ds-brand-wash` | #fdecec | rgba(237,28,36,.16) | active filter chip, active tab count, selected menu option |
| `--bg` | `--ds-bg` | #fafafa (design #f3f5f8, deviation 7) | #01030a (design #020617, deviation 7) | page |
| `--card` | `--ds-card` | #ffffff | #0f172a | cards, drawers, menus, top bar, secondary buttons |
| `--surface2` | `--ds-surface2` | #f6f7f9 | #132036 | kv panel, table header band, in-card search, active in-card tab, board columns |
| `--bd` | `--ds-bd` | rgba(15,23,42,.08) | rgba(148,163,184,.16) | card borders |
| `--line` | `--ds-line` | #e7e9ee | #1e293b | control borders, dividers, dotted row rules |
| `--ink` | `--ds-ink` | #231f20 | #e5e9f0 | headings, figures, row titles, pager active fill |
| `--ink2` | `--ds-ink2` | #4b4b4b | #cbd5e1 | body copy, secondary button text, muted chip text |
| `--ink3` | `--ds-ink3` | #6b6b6b | #94a3b8 | labels, subs, meta, placeholders (`--ds-placeholder`) |
| `--ink4` | `--ds-ink4` | #9f9f9f | #64748b | decoration only (deviation 3) |
| `--ok/--warn/--bad/--info/--vio/--teal` | `--ds-ok` … `--ds-teal` | #16a34a #d97706 #dc2626 #2563eb #7c3aed #0f8b8d | #22c55e #f59e0b #f87171 #60a5fa #a78bfa #2dd4bf | fills: RAG bar, meters, bars, gate cells, solid RAG buttons |
| — | `--ds-ok-text` … `--ds-teal-text` | #166534 #92400e #b91c1c #1d4ed8 #6d28d9 #0f766e | = fills | chip text, KPI context/trend colour (deviation 1) |
| `--okw` … `--tealw`, `--mutedw` | `--ds-okw` … `--ds-mutedw` | #e7f6ec #fdf2e2 #fdecec #e8effd #f1ebfe #e2f3f3 #eef0f3 | 14–15% alpha of the dark hue | chip washes, meter track (`mutedw`), bar fill (`infow`) |
| `--feat-*` | `--ds-feat-bg/-fg/-sub/-track` | #231f20 / #fff / 66% / 16% | #1e293b / #f8fafc / 62% / 12% | featured (dark) KPI card |
| `--shadow` | `--ds-shadow` | 0 1px 2px rgba(35,31,32,.06), 0 8px 24px -12px rgba(35,31,32,.18) | 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6) | cards, KPI cards, panels |
| — | `--ds-shadow-drawer`, `--ds-scrim`, `--ds-shadow-menu` | -16px 0 40px rgba(15,23,42,.22) · rgba(15,23,42,.38) · 0 10px 30px rgba(0,0,0,.35) | same | drawer, backdrop (no blur), dropdowns |
| `--side` | `--ds-side` | #241f20 → #5c0f13 | #0b0f1a → #3a0a0d | sidebar gradient |
| — | `--ds-side-active` · `--ds-side-ink` · `--ds-side-dim` · `--ds-side-count` | #b81c22 · 78% white · 55% white · 16% white | same | sidebar |

Metrics: sidebar 232px · top bar 58px · page padding 22px · body gap 16px · rail 340px · KPI gap
12px · drawer 440px (wide 580px) · control 36px (compact 28px) · radii: card/panel 18, KPI 16,
kv 12, control/tab/filter 10, compact button/close 8, pager 7, chip/pill 999.

**Contrast (measured, enforced by the test).** Light: ink 16.3, ink2 8.7, ink3 5.3 on card
(4.97 surface2, 4.88 page); brand-ink 5.8 on card, 5.1 on wash; status text 4.8–6.4 on washes;
white on side-active 6.5; side-dim 5.0–5.8. Dark: ink3 7.0, brand-ink 7.9, status 5.2–7.3 on
washes, side-dim 5.8–6.2. Exception: white on #ED1C24 4.38 (deviation 4). Mini charts carry no
information that isn't also in the figure or legend text, so their fills are exempt from 3:1.

### Casing

**Title Case** for labels: page, card, section, drawer and dialog titles; tab labels; nav items
and group labels; buttons; KPI labels; table column headers; filter chip labels; PDF headings.
**Sentence case** for copy: descriptions, helper text, placeholders, empty states, toasts, Daily
Brief lines, KPI context lines, row titles and subs, and **status/tag chips** ("On track", "Head
approval needed"). Minor words stay lower case unless first or last: a, an, and, as, at, but,
by, for, in, of, on, or, the, to, via, with. Proper nouns and product names are unchanged
(QUBIT, YouTrack, Daily Brief, Risks & Issues). Uppercase-styled labels (sidebar group, drawer
group, list group headings) are still written in Title Case in the source.

### Components (design class → app component)

**Shell.** Grid `232px 1fr`, page `--ds-bg`, base 13px.
- Sidebar (`.m-side`): `--ds-side`, padding 16×12, 16px between groups. Logo: 22px square radius
  6 #ED1C24 + wordmark 14/800, tracking .08em, white. Group label (`.sg-h`) 10.5/700 uppercase
  tracking .09em `--ds-side-dim`, padding 0 10 4; items 2px apart. Item (`.si`) 36px, padding 0 10,
  radius 10, gap 10, 13/500 `--ds-side-ink`, icon 16. Active: `--ds-side-active`, white, 600.
  Count (`em`) 10.5/700, min-width 20, height 18, padding 0 6, pill, `--ds-side-count` white;
  **active item's count inverts**: white fill, #b81c22 text.
- Viewing as (`.va-btn`): padding 8×10, radius 10, 10% white fill + inset 1px 22% white; caption
  10.5 `--ds-side-dim`, value 12.5/700, chevron right; open: 20% fill, 45% ring. Menu (`.va-dd`):
  card, radius 12, padding 6, `--ds-shadow-menu`; options 12.5, padding 7×9, radius 8; selected
  brand-wash / brand-ink / 700 + check; helper 10.5 ink3.
- Footer (`.m-foot`): pinned bottom, top rule 12% white, padding 10 8 2, gap 10; avatar 30px
  round, 18% white, 11/700; name 12.5 white; second line = **role** 11.5 `--ds-side-dim`.
- Top bar (`.m-top`): 58px, card fill, bottom `--ds-line`, padding 0 22, gap 10. Search
  (`.m-search`): flex 1, max 420, 36px, radius 10, surface2, line border, 12.5 placeholder, ⌘K
  `kbd` 10.5 bordered. Then spacer, "+ New" (primary), "Ask Q" (secondary), bell (36px square
  secondary). Buttons (`.tb`) 36px, radius 10, padding 0 12, gap 6, 12.5/600.

**Page header** (`.m-head`): flex, space-between, **align start**, gap 12. Date/crumb line
11.5/600 ink3 (not uppercase); title 22/800, margin-top 2; description 13 ink3, margin-top 2.
Actions (`.m-act`) gap 8, no wrap, 36px buttons. Homes have **no** header action.

**KPI row and card.** Grid gap 12. Homes: `1.4fr 1fr 1fr 1fr` (three cards: `1.4fr 1fr 1fr`),
the first card is the wide one. Reports pages (the On Track / At Risk / Off Track row): three
equal columns. Card
(`.kpi`): card, `--ds-bd`, radius 16, `--ds-shadow`, padding 14×16, column gap 4. Top line
(`.kpi-top`): label 12/600 ink3 left, trend 11.5/600 ink3 right (bad/good → `-text` tokens).
Figure 23/700 tabular, line-height 1.2; unit 12/600 ink3, margin-left 5. Context 11.5 ink3
(`bad`/`good` coloured). Chart (`.viz`) pinned bottom (`margin-top: auto`, padding-top 8):
- RAG bar: 8px, pill, 2px gaps, ok/warn/bad; legend 11px ink3, gap 10, 7px dots, bold counts.
- Bars: 26px tall, gap 3, radius 3 3 0 0, min 3px, fill `--ds-infow`, **last bar `--ds-info`**.
- Meter: 6px pill on `--ds-mutedw`; fill info (default) / ok / warn / bad.
- Spark: 30px tall SVG; area `--ds-infow`, line `--ds-info` 1.8, end dot `--ds-info`.
- Featured card (`.kpi-feat`): `--ds-feat-bg`, no border, text `--ds-feat-fg`, sub `--ds-feat-sub`;
  tracks `--ds-feat-track`; bars/spark accent #ff8a8f, spark area rgba(237,28,36,.18).

**Columns.** Main + rail `1fr 340px`, gap 16, align start; rail cards 16px apart.

**Panel** (`.mp`, main cards and rail cards): card, `--ds-bd`, radius 18, `--ds-shadow`, padding
16×18, gap 12. Header (`.mp-h`): title **16/700** left, link right. **Link** (`.link`): 12/600
`--ds-brand-ink`, gap 3, trailing arrow icon 12px. Home main cards always have a title + link.
Rail row (`.ri`): column, gap 5, padding 9px 0, **dotted** `--ds-line` bottom (none on the last);
top line title 12.5/600 + chip right; sub 11.5 ink3; optional 6px meter. "Suggested" pill
(`.sug`): 11/600 ink3 on surface2, padding 2×9, pill.

**Tabs** (`.tab`): row gap 4; tab 12.5/600 ink3, padding 8×14, radius 10 10 0 0, 2px bottom border
transparent, gap 6. Active: ink, fill card (inside a panel: surface2), bottom border brand. Count
10.5/700, padding 0 6, pill, line-height 17, `--ds-mutedw` / ink2; **active count brand-wash /
brand-ink**. No full-width line under the row.

**Toolbar** (`.tbar`): gap 10, wraps. Search (`.srch`): 36px, min-width 280 (inside a panel: 0,
surface2 fill), padding 0 12, radius 10, card fill, line border, gap 8, 14px icon, 12.5
placeholder. Filters (`.tb-f`) gap 6. **Filter chip** (`.fchip`): 36px, padding 0 12, radius 10,
line border, card fill, 12.5/600 ink2, gap 5, label = dimension name + 11px chevron. Active:
brand-wash, transparent border, brand-ink, label "Priority: High" + × icon. **Clear all**
(`.clr`) inline after the chips, 12/600 brand-ink, shown when more than one filter is on.
Actions (`.tb-a`) pushed right, gap 8.

**List rows** (`.row`, home lists): grid `1fr auto 92px auto` (title · chip · meta · action), gap
12, padding 10×4, dotted bottom. Title 13/600 and sub 12 ink3, both single-line ellipsis; meta
11.5 ink3 right-aligned tabular; action = compact secondary. Group heading (`.grp`) 10.5/700
uppercase tracking .08em ink3 (deviation 3), padding 10 4 2, no band. Footnote (`.foot`) 12 ink3,
space-between ("Showing 6 of 11" · link). **Homes use the footnote, not a pager.**

**Table** (`.sgt`): 12.5px. Header cells on a surface2 band with 8px rounded ends, 11/700 ink3,
tracking .03em, **not uppercase**, padding 8×10. Cells padding 10, dotted bottom, middle-aligned;
bold = 600.

**Pager** (`.pager`, inside the card): top border line, padding-top 12, space-between, 12px ink3
tabular. Rows per page: "Rows" + 28px chip (padding 0 8, line border, radius 7, ink 600, chevron).
Page buttons 28px (min-width), radius 7, line border, card fill, ink2 600; prev/next icon-only;
**current page `--ds-ink` fill + card text**; disabled 40% opacity; ellipsis ink3.

**Buttons.** Secondary (`.btn-g`): card fill, line border, **ink** text, 600, gap 4, radius 10,
36px, padding 0 14, 12.5px. Compact (in rows): 28px, padding 0 11, radius 8, 12px. Primary
(`.btn-p`): `--ds-brand` fill and border, white (deviation 4). One primary per page header and
per drawer footer.

**Chips** (`.chip`): 11/600, padding 2×8, pill, line-height 1.5, **no dot**. Tones: ok, warn, bad,
info, vio, teal (wash + `-text`), muted (`--ds-mutedw` + ink2). Gate chips (`.gchip`) 11.5/600,
padding 3×10. Gate cells (`.gc`) 16px, radius 5: done ok · in progress warn · late bad · not
started mutedw with a line ring; legend cells 11px radius 3.

**Daily Brief** (`.brief`): radius 14, padding 16×20, `--brief-bg`, white, gap 8. Tag pill
10.5/700 uppercase tracking 1.2px, 15% white, padding 4×10; time 11px. Lines: grid `1fr auto`,
gap 12, 13.5px at 94% white, padding 6px 0, top rule 12% white, clamped to two lines; action
link 12/600 white, underlined (offset 3, 40%). "View N more": 12/700 pill, 14% white fill, 40%
white border, padding 5×13. Footer 11.5 at 90% white.

**Drawer** (`.m-drawer`): right panel 440px (wide 580px), card fill, line left border,
`--ds-shadow-drawer`; scrim `--ds-scrim`, **no blur**.
- Header (`.dr-h`): padding 18×20, bottom line, gap 12. Optional step line 11.5/600 ink3
  ("Stage Gate 6 of 6 · Go-Live Readiness"); title 17/700 (Brief drawer: 16/700 brand-ink with
  icon, gap 6); subtitle 12 ink3, margin-top 2. Close (`.dr-x`): 32px, radius 8, line border,
  card fill, ink2 icon.
- Body (`.dr-b`): scrolls, padding 16×20, gap 14. Section (`.dsec`) gap 8, head 11/700 uppercase
  tracking .07em ink3. Group head (`.dr-gh`) same style + count pill (mutedw, ink2). Item
  (`.dr-i`): grid `1fr auto`, gap 12, padding 10px 0, dotted; title 13/600; sub 12 ink3.
- Field (`.f`): gap 5; label 11.5/600 ink3; input (`.fi`) min 36px, line border, radius 10, card
  fill, padding 0 11, 13px ink; textarea min 64px, padding 9×11, line-height 1.5, ink2.
- Kv (`.kv`): 2-column grid, gap 10×16, surface2, radius 12, padding 12×14; label 11.5 ink3
  above value 13/600.
- Choice (`.segs`): separate buttons, gap 6; padding 7×14, line border, radius 10, 12.5/600 ink2,
  card fill; selected: ink fill + card text. RAG variant (`.rag3`): selected fills solid ok /
  warn / bad with white text, labelled **On track / At risk / Off track**.
- Toggle (`.seg`): one bordered group, padding 3, gap 3, radius 10; buttons 12.5/600 ink2,
  padding 5×11, radius 7; pressed: ink fill + card text.
- Banner (`.banner`): radius 10, padding 10×12, 12.5 ink; info = infow, warn = warnw; no icon.
- Checklist (`.ck`): rows 13px, gap 8; met = ok icon, unmet = ink3 icon and text. Blocker callout
  (`.blk`): badw, radius 10, padding 12, 12.5 ink, bad icon. File chips (`.files`): 12px, padding
  5×10, radius 8, surface2, ink2. Person rows (`.mrow`): grid `auto 1fr auto auto`, gap 12,
  padding 10px 0, dotted. Body text (`.dp`) 13 ink2, line-height 1.55; hint 12 ink3.
- Footer (`.dr-foot`): padding 12×20, top line, buttons right-aligned 36px, gap 8; optional note
  left 12 ink3. Plain footnote (`.dr-f`) 11.5 ink3.
- Behaviour: focus trapped, Esc and backdrop close, focus returns to the trigger, labelled by
  the title. Phones: full width.

**Board** (`.kb`): 3 columns, gap 14. Column surface2, radius 14, padding 12, gap 8; head 13px +
count pill (card fill, 11/700 ink2). Card: card fill, `--ds-bd`, radius 11, padding 10×12, gap 3,
shadow 0 1px 2px rgba(15,23,42,.05); title 13/600; sub 12 ink3; meta row 11.5 ink3.

**Lifecycle (Portfolios).** Stage tiles (`.stages`): 5 columns, gap 10; tile card, radius 14,
padding 12×14, figure 22/700, label 12 ink3, selected = 1.5px inset brand ring. Lifecycle cards
(`.lcard`): KPI card anatomy with the stage colour (`--c`) for label and figure, 36px round
icon on the stage wash, trend top right, 40px edge-to-edge spark, dots row (stuck = warn dot).

**Report charts** (`.chart`): grid lines `--ds-line`; axis text 10.5 ink3; value labels 11.5/700
ink; trend line `--ds-brand` 2.2; bars `--ds-infow` with 35% info stroke, highlight `--ds-info`.

**Sign-in** (`.auth`): two equal columns on the card. Left: centred illustration, heading 26/800,
sentence 15 ink2 (max 38ch), padding 40×56. Right: padding 36×72; logo 26px square radius 7 +
wordmark 15/800; form card max 420, radius 18, `--ds-shadow`, padding 28×30, gap 16; title
24/800; lead 14 ink3. Buttons 36px radius 10 13/700 (primary brand; Microsoft = secondary with
the four-square mark). "or" divider 12 ink3 with line rules. Links 12.5/600 brand-ink. OTP: six
boxes, gap 8, 48px tall, radius 10, line border, 20/700; current box brand border + 3px
brand-wash ring. Password checklist: 2 columns, gap 6, 12 ink3, met = ok-text + check. Footer
12 ink3, space-between ("Riverbank Group" · "Help · Privacy").

**Responsive.** Below 1024px: rail stacks under the main column; KPI row 2 columns (1 below
640px); sidebar off-canvas; drawers full width; toolbar wraps with search full width.

**Dark mode.** Same layout; only `--ds-*` values change (table above). PDFs stay light. Theme
switcher: Light / Dark / System in the user menu, default Light.

## Core components (map to shadcn/ui where possible)

| Component | Built from | Notes |
|-----------|-----------|-------|
| Topbar | custom | logo mark (4-square glyph), nav tabs, **TenantChip**, avatar |
| Sidebar | custom | grouped nav: Navigation, Portfolios, Standalone, Subsidiaries, footer Risks badge |
| TenantChip | dropdown-menu | shows current tenant; switcher only for super-admin |
| KpiCard / KpiStrip | card | label, big value (colour by status), foot text, thin progress bar |
| HealthHeatmap | table | Portfolio × Subsidiary cells; colour by worst status; `—` for empty |
| PortfolioCard | card | RAG counts, avg progress bar, subsidiary pips; left accent bar on hover |
| StandaloneCard | card | type badge (Programme/Project), status pill, progress, sub pips |
| ProjectTable | table | filter chips + search; row → opens panel |
| SlidePanel | sheet | right-side 660px panel; overlay; project & programme variants |
| StatusPill | badge | maps status → colour |
| MilestoneChip / MilestoneMatrix | badge + table | per-subsidiary milestone states |
| Breadcrumb | custom | Group → Portfolio / Subsidiary |
| RiskFeed / MilestoneFeed | list | dot + text + meta rows |

## Layout metrics (from the reference)

- Topbar height 54px, sticky. Sidebar width 216px. Content padding 26px, 22px gap between blocks.
- Card radius 10px; border `1px solid var(--ink4)`; hover raises `--shadow` and brand-tinted border.
- Slide panel: 660px, `transform: translateX` transition ~0.27s; dimmed overlay.
- Grids: KPI strip up to 6 columns; portfolio cards 2-col; standalone 3-col; bottom split
  `1fr 370px`.

## Theming implementation sketch

```tsx
// (app)/layout.tsx — server component
const { brandColor, brandLight } = await getTenantBrand(); // from session tenant
return (
  <div style={{ ["--brand" as any]: brandColor, ["--brand-light" as any]: brandLight }}>
    <Topbar /> <div className="shell"><Sidebar /><main>{children}</main></div>
  </div>
);
```

Tailwind theme extension maps `brand` colour utilities to `var(--brand)` so `bg-brand`,
`text-brand`, `border-brand` all follow the tenant.

## Accessibility

- Colour is never the only signal — pair RAG colour with a text label (as the reference does).
- Focus states visible; panels trap focus and close on Esc; overlay click closes.
- Sufficient contrast for text on brand backgrounds.
