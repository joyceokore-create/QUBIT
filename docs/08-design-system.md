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
