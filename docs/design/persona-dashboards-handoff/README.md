# Handoff: QUBIT Role-Based Dashboard Presets (Riverbank tenant)

## Overview
Design reference for the five persona dashboard presets on `/dashboard` (docs/17 + docs/18-amended):

- **Executive, PM, Developer** — visual elevation passes over the presets already built in the codebase.
- **QA and Implementor** — the **new M1c designs** (17 §5 and §7). Nothing exists for these in the codebase yet.
- The shared **portfolio pipeline sections** (18 §6 amended) rendered at both density extremes (exec 12+ rows, developer 3).

Designed for the **Riverbank tenant** (red, sidebar shell, Material re-skin), **light and dark**.

## About the Design Files
`PMS Dashboards.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, **not production code**. The task is to recreate it inside the existing QUBIT codebase: Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui, using the established preset/widget architecture. Do not port the HTML.

**Where it slots in** (all paths relative to repo root):

| Concern | Existing file |
|---|---|
| Route + preset dispatch | `src/app/(app)/dashboard/page.tsx` (qa/implementor currently fall through to `InterimPreset`) |
| Preset registry | `src/components/dashboard/presets/registry.ts` |
| Built presets to elevate | `src/components/dashboard/presets/{executive,pm,developer}.tsx` |
| Shared chrome (CARD, Panel, Empty) | `src/components/dashboard/presets/v2-sections.tsx` |
| Portfolio sections + pipeline table | `src/components/dashboard/{portfolio-sections,pipeline-table}.tsx` |
| Shell (do not change) | `src/components/layout/riverbank-shell.tsx`, `topbar.tsx` |
| Tokens (already exist — use them) | `src/app/globals.css` (`[data-tenant="riverbank"]` + `.dark` blocks) |
| Persona plumbing (already exists) | `persona-switcher.tsx`, `src/lib/personas`, session `activePersona` |

New files implied: `presets/qa.tsx`, `presets/implementor.tsx`, and server data modules following the `src/server/dashboard-{exec,pm,dev}.ts` pattern (e.g. `dashboard-qa.ts`, `dashboard-impl.ts`).

## Fidelity
**High-fidelity** for layout, hierarchy, spacing, chip/pill grammar, and both themes — recreate the composition and rhythm exactly, but **express every value through the existing CSS custom properties and Tailwind utilities** (`var(--cardbg)`, `var(--hair2)`, etc.), never the raw hexes in this doc. The prototype hardcodes the Riverbank token *values*; the app must keep resolving them per-tenant/per-theme so KCB renders green with zero component changes (docs/08 hard rule).

## ⚠ Where this design does NOT capture the real app exactly
Read this before implementing — these are deliberate approximations or proposals, not specs to copy blindly.

**Shell & chrome (approximated — the real components are the truth)**
1. Sidebar/topbar are simplified recreations: no mobile drawer + focus trap, no skip-link, no tenant-switcher menu, no notification dropdown, no user-menu dropdown, no Ask Q drawer, sign-out is dead. Keep using `RiverbankShell` as-is.
2. Nav/UI icons are hand-drawn SVG approximations of the lucide set. Use the real lucide icons from `nav-items.ts` (`LayoutDashboard`, `ListChecks`, …).
3. Pipeline stat chips use the design-system glyphs `⛊ ⚑ ⏱ ● ☺`; the built `pipeline-table.tsx` uses lucide `ShieldAlert/Flag/Gauge/TriangleAlert/UsersRound`. **Keep lucide** — the glyphs were a prototyping shortcut.
4. Fonts load from Google Fonts in the prototype; the app self-hosts via `next/font`. Riverbank type re-skin (`rv:` variants) is approximated: panel titles render 15px/700 here vs the app's `rv:text-heading-xs` (16px/600, +.01em); some micro-labels kept IBM Plex Mono where the app's `rv:font-sans` overrides would render Inter overline. Follow the app's `rv:` utilities, not the prototype's pixel values.
5. Desktop-only: the real pipeline table's `max-md` column collapse, `prefers-reduced-motion` handling, and the spec's aria-labels on Δ arrows / RAG chips (16 §11: never colour-only, screen-reader channel required) are not in the prototype. They are required in the implementation.
6. Rows/queues are static `div`s; in the app every row is a `Link` with the existing deep-link contract (`/projects/:id`, `?tab=Board&task=`, `?lens=dev`, nudge snooze, etc.). `FirstLoginChecklist` is omitted from the PM/dev heroes but must stay.

**Content & data (illustrative, not seeded truth)**
7. All numbers are invented demo data. Real: CBS Phase 1 (P001), Mobile Banking 2.0 (P004), Checksmart, Keza, Lumi, One-View, ZED ERP modules, Swipe channels come from the specs/wireframe; P007/P009/P012–P017/P020, all people except Joyce Okore, health 62, WoW +4, and every count/age are placeholders. Wire everything to the real engines (`health.ts`, snapshots, relevance) — "every number is derived and explainable".
8. The health "why?" popover content is static text; real one renders the engine's factor breakdown.

**Spec-target vs current-state divergences (intentional design proposals)**
9. **ZED ERP renders the M-D target rollout heatmap** (module × market, summary row, top-blockers strip). The app today shows the interim pipeline lens with the `ROLLOUT · PIPELINE LENS` chip — keep the interim until M-D ships; this design is the destination.
10. **Scope toggle on QA and Implementor** is a proposal per DM1.20 (toggles wherever a default filter applies). The built app only has it on PM (via `?scope=`). Recommend adopting; flag to supervisor.
11. **Implementor gate ticks (n/8 segments) and the go-live calendar** visualize data that only exists after 16-revamp M8 (stage machine / gate checklists). Interim source per 17 §7: project status + milestones tagged UAT/pilot — the honest mono note under "Open gate items" must ship with the interim wiring.
12. QA aging tint/threshold (>5d bad, 3–5d warn) mirrors board-lens QA logic conceptually — confirm the exact thresholds against `board-lens.ts` rather than these constants.
13. Swipe heatmap cells carry LIVE/TEST/— labels + RAG tint (label = the required second channel). ZED module cells carry `● Δ` only, counts on hover — per the 17 §2 one-encoding rule. The "All ZED" summary row carrying derived % numbers is per the supervisor wireframe.
14. "Unassigned" portfolio is shown populated for demonstration; real rule: seeded, renders last, **only when non-empty**.
15. Persona switcher shows all five personas; the real component renders only the user's effective groups (≥2).

## Screens / Views
One route, one shell, five compositions. Shared frame: sidebar (256px, collapsible to 80px) → content column → gradient topbar (62px) → header strip → `max-width:1360px` content column, `padding:14px 24px 90px`, vertical `gap:14px`. Every card: `background:var(--cardbg); border:1px solid var(--cardbd); border-radius:16px; box-shadow:var(--cardsh)`, entrance `rise .5s cubic-bezier(.22,1,.36,1)`.

**Header strip** (all personas): `{PERSONA} VIEW · RIVERBANK GROUP` overline (10.5px/700/+2.2px, --ink4) · persona pill switcher (active: `--brand` bg, white text; 9.5px Plex Mono 700 uppercase) · REPORTS link · flex hairline · date · live clock (Plex Mono 10.5px) · pulsing `LIVE` dot (--ok).

### 1. Executive (`data-screen-label="Executive dashboard"`)
- **Hero | Health trend** grid `minmax(0,1fr) 290px`. Hero panel "Good day, Joyce" + `3 DECISIONS WAITING` sub; 3 needs-attention rows (3px severity bar, 12.5px title, 9px mono meta, → affordance). Health card: `PORTFOLIO HEALTH` overline + `? WHY?` details-popover (230px, factor breakdown), 34px/-1px tabular score coloured by band (≥70 ok / ≥40 warn / else bad), 110×30 sparkline, `↗ +4 WOW` chip.
- **Decision queue** panel: rows = 86px kind pill (ESCALATION --bad / CHECK-IN --warn / APPROVAL --qinfo; bordered pill = `color:var(tok); border:1px color-mix(tok 35%); bg:color-mix(tok 9%)`) + title + project mono + age + →.
- **Portfolio sections** (shared, below) — all portfolios.
- **Since you last looked** panel: severity-bar delta feed rows.

### 2. PM
- **Ritual hero** card: bold 13.5px "2 of 5 check-ins unconfirmed — due Friday" + `⛊ 1 BLOCKER >3D` (--bad) + `4 DRAFTS AWAITING APPROVAL` (--qinfo) mono chips.
- **Scope toggle** (right-aligned, above sections): `MY PROJECTS | ALL` pill pair, filters sections.
- **Portfolio sections** — scoped.
- **Action queue | Team load** grid `1.4fr 1fr`. Action rows: 72px kind pill (BLOCKER/APPROVAL/JOIN/SLIPPING) + title + project + age. Team load rows: name + right-aligned `110% · OVER` (over-allocation: --bad text and bar; else --brand bar on --wash2 track, 4px). Footer note: `LEAVE BADGES JOIN WITH M6`.

### 3. Developer
- **Focus hero**: `WORK ON THIS NOW` overline (brand-as-text token: `--accent-foreground`) + reason chip (`3d overdue — clear it first`, --wash2) + 19px/700 task title + Plex Mono meta + solid `--brand` button "▶ Start — open the card" (9px radius, 12.5px/700 white).
- **Queue buckets**: 4-col grid of `<details>` cards — 22px tabular count (tok colour when >0, --ink4 at 0) + mono label; Overdue open by default; blocked row meta in --bad with ⛊ reason; empty bucket = "Nothing here."
- **Portfolio sections** — mine (3 rows; the table's minimum-density case).
- **Done this week** panel: ✓ (--ok) + title + project code. Sub: `MOMENTUM · FEEDS YOUR WEEKLY REPORT`.

### 4. QA — new design (17 §5)
- **Hero**: "7 items ready for you to test" + `⚠ 2 CRITICAL BUGS UNASSIGNED` (--bad) + `3 AGING >5D` (--warn). Sentence + chips, deliberately NOT KPI tiles (18 §0 decision 1).
- **Test queue | right column** grid `1.4fr 1fr`.
- **Test queue** panel: **triage strip first** — `color-mix(--bad 6%)` band, `TRIAGE FIRST — 2 CRITICAL BUGS UNASSIGNED` header, rows with CRIT pill + ASSIGN ghost button. Then per-project groups (wash header, Plex Mono name + count) with rows: 40px age chip (>5d: bad chip + `color-mix(--warn 5%)` row tint; 3–5d warn; else neutral) + title + TEST/BUG type chip + →. Footer note explains the tint and that completion belongs to QA.
- **Bugs I raised** panel: severity pill (CRIT bordered / HIGH / MED) + title + `PROJECT · RAISED nD AGO` mono + optional `⟳ REOPENED` (--bad on --badbg) + status chip (WITH QA / IN PROGRESS --qinfo, TO DO neutral).
- **Project quality** panel: per project — name + `1C · 2H · 4M` counts + `11% REOPEN` (warn when >10%) + 5px stacked severity bar (bad/warn/qinfo segments, width ∝ counts) + honest footer `REQUIREMENT COVERAGE JOINS AFTER M8 · open risks →`.
- **Portfolio sections** — mine, with scope toggle.

### 5. Implementor — new design (17 §7)
- **Hero | Open gate items** grid `1fr 340px`. Hero: `NEXT GO-LIVE` overline + 22px "ZED Card — Rwanda" + `FRI 7 AUG · IN 9 DAYS · AMBER` mono + one plain-language critical-path sentence. Gate panel: 3 rows (item + `✗ OPEN · LATE` --bad / `✗ OPEN` --warn / `◐ IN REVIEW` --warn chips) + interim-source note.
- **Pilot & UAT projects | Rollout issues** grid `1.25fr 1fr`. Pilot rows: name/code + UAT (--qinfo) / PILOT (--ok) stage chip + gate segments (8 × 9px squares: done --ok, late --bad, open --wash2) with `5/8` label + go-live date + `● Amber/Green` RAG chip.
- **Go-live calendar | Handover docs** grid `1.25fr 1fr`. Calendar: 7-col month grid (Plex Mono day numbers, weekends washed, event days brand-tinted + brand dot + tooltip), legend rows below, `BEYOND WINDOW: …` note. Handover rows: doc + project + `AWAITING <ROLE>` warn chip + age.
- **Portfolio sections** — mine, with scope toggle.

### Shared: Portfolio sections (18 §6 amended)
`<details>` card per portfolio, worst health first, Unassigned last. Open when RAG ≠ Green (DM1.30). Summary: ▸ + 14px/700 name + RAG pill (dot + label) + Δ glyph (↗ worsened --bad / ↘ improved --ok / → flat --ink5, each with title/aria) + right-aligned mono meta (`12 PROJECTS · 41% · 3 BLOCKED · OWNER` or `4 OF 12 · MY PROJECTS`).
Body, by viewKind — **Pipeline**: stage groups (wash header: STAGE + count + blurb "in delivery"/"business case under review"/"ideas being shaped") of rows on grid `minmax(0,1.2fr) 60px 96px minmax(0,1.4fr) auto`: name+code / bordered priority chip (High --bad, Strat --qinfo, New --ok, Med --warn, Low --ink4, Paused --ink5) / 36px progress bar (--brand fill on --wash2) + % / italic 11px status note ("check-in unconfirmed this week" when missed) / 5 stat chips + →. **Rollout**: `130px repeat(6,1fr)` heatmap (KE TZ UG RW BI SS), summary row with derived %, `● Δ`-only module cells, `—` for not-started, top-blockers strip (3px severity bar + text + age), one-line mono legend.

## Interactions & Behavior
- Persona switch: in-page state here; real app = `?persona=` + POST `/api/me/persona` (persist last-used), re-render server-side.
- Scope toggle: filters sections to rows the viewer is a member of; drops empty sections; header count becomes `N OF 12 · MY PROJECTS`. Never a wall.
- Sections/buckets/why-popover: native `<details>`.
- Theme: `.dark` class re-resolves every token; in-app this is the existing next-themes toggle.
- Sidebar collapse: 256↔80px, `width .3s cubic-bezier(.22,1,.36,1)`, labels hidden collapsed, persisted (`rv-sidebar-open`).
- Entrance: `rise` keyframe on top-level blocks; LIVE dot: `pulseGlow 2.6s infinite`. Honour `prefers-reduced-motion`.
- Hover: rows get `background:var(--wash)` (in-app pattern; not in prototype).

## State Management
Per the existing architecture — presets are server components fed by one data module each:
- QA: `{ hero: {inQa, criticalUnassigned, agingOver5d}, queue: ProjectGroup[{project, items[{title, kind, ageDays, unassigned}]}], bugsRaised[{title, project, severity, status, reopened, ageDays}], quality[{project, bySeverity, reopenRate}] }` — sources: relevance engine QA pool, `listTasksInTestPhase`, board-lens aging.
- Implementor: `{ nextGoLive: {project, market, date, rag, gateOpen[]}, pilots[{project, market, stage, gatesDone, gatesTotal, lateGate, goLive, rag}], issues[], calendar30d[], handoverDocs[] }` — interim source: status + UAT/pilot-tagged milestones (note in UI), gate data after M8.
- Both reuse `getPortfolioSections(ctx)` for the sections block.

## Design Tokens
All defined in `src/app/globals.css` — reference by name only. Key set used: `--brand --onbrand --qbg --qcard --card2 --elev --cardbg --cardbd --cardsh --qink --ink2..--ink5 --ok/--okbg --warn/--warnbg --bad/--badbg --qinfo/--infobg --hair --hair2 --wash --wash2 --w07 --accent-foreground --rv-sidebar --rv-topbar --rv-active`. Derived tints via `color-mix(in oklab, var(tok) 9|10|13|35%, transparent)`.
Type: Inter (Riverbank display/body/num), IBM Plex Mono for codes/metrics/micro-labels. Scale used: 34/22/19/17/15/14/13.5/12.5/12/11/10.5/9.5/9/8.5px. Radii: 16 card / 10 inner / 9 button / 6 cell / 5 chip / 99 pill. Row padding: 9px 16px; panel header 12px 16px.

## Assets
- `assets/qubit_main_white.svg`, `assets/qubit_icon.svg` — copied from `QUBIT/src/assets/` (the app already imports these via `BrandLogo`).
- No other imagery. Icons: lucide (see divergence #2/#3).

## Files
- `PMS Dashboards.dc.html` — the full interactive prototype (all five personas, light/dark, collapse/toggles working). Open directly in a browser.
- `assets/` — logo SVGs.
- `screenshots/` — one capture per persona per theme: `{executive|pm|developer|qa|implementor}-{light|dark}.png`. The prototype is the source of truth for exact values; screenshots are for orientation.
