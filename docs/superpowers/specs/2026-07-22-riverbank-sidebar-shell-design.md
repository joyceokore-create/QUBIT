# Riverbank app-shell — collapsible left sidebar (Phase 1)

**Date:** 2026-07-22
**Branch:** `nancys_ui-fixes`
**Status:** Approved (design) — Phase 1 of the Riverbank app redesign
**Scope:** UI/UX only — no application logic, data, routes, or RBAC touched.

## 1. Goal

Give the **Riverbank** tenant a distinct app shell: a collapsible **left sidebar**
for primary navigation plus a slim **top header** for the page title and utility
controls — replacing the shared top-navigation bar for that tenant only. **KCB and
pre-auth are completely unchanged** (they keep the current topbar).

This is Phase 1 (the shell). Later phases restyle the shared components
(buttons, tables, forms/inputs) `rv:`-scoped; not in this pass.

## 2. Design (target visual language)

- **Sidebar** — a vertical brand gradient (Riverbank navy/charcoal → red), white text.
  Logo at top; icon + label navigation; the active item is a solid red pill; hover is a
  subtle white wash. Collapsible between a labelled width (`w-64`) and an icon-only rail
  (`w-20`); below `md` it becomes an off-canvas drawer with a backdrop. A user block
  (avatar + name/role) sits pinned at the bottom.
- **Top header** — sticky, same gradient family; the current page title on the left
  (plus a mobile hamburger to open the drawer), and the utility controls on the right
  (theme toggle, notifications, tenant switcher, Ask-Q, user menu).
- **Main content** — offset by the sidebar width on desktop; full-width on mobile.

Values come from the existing Riverbank tokens (`--rbrand` red, charcoal/navy neutrals)
already defined per theme in `globals.css`; the gradient is composed from those. No new
brand colours are invented.

## 3. Architecture

### 3.1 Tenant-conditional shell (server)

`src/app/(app)/layout.tsx` already resolves the session and sets `data-tenant` + `--brand`.
Add a branch on `session.user.tenantSlug`:

```tsx
{isRiverbank
  ? <RiverbankShell {...shellProps}>{children}</RiverbankShell>
  : (<div className="relative z-[1]"><Topbar /><main …>{children}</main></div>)}
```

`shellProps` are the server-resolved values the shell needs (all already computed in the
layout / topbar today): `canAccessAdmin`, `canSwitchTenant`, `tenants` (only when the
switcher is allowed), and the user display fields (name, role, initials, avatar).
The `AmbientField`, `QProvider`, `SlidePanelStateProvider`, `SlidePanel`, `QDrawer`
wrappers stay exactly as they are and wrap both branches.

### 3.2 The shell is a client component

`src/components/layout/riverbank-shell.tsx` (`"use client"`). It owns:
- sidebar collapse state (persisted to `localStorage`, default expanded on desktop),
- mobile drawer open/close state (Escape + resize-to-desktop close it),
- active-route detection via `usePathname()`.

Every reused chrome control is **already a client component** — `NavPills` (source of the
route list), `TenantChip`, `UserMenu`, `AskQButton`, `NotificationBell`, `ThemeToggle`,
`TimerWidget` — so the shell imports and renders them directly. No server/client boundary
issue; the server layout only passes plain data props.

### 3.3 Navigation model

Reuse the exact route list + permission gating from `nav-pills.tsx` (single source of
truth): Dashboard, My Tasks, Projects, Teams (`admin:access`), People, Reports,
Admin (`admin:access`). Extract that `TABS` array to a shared module
(`src/components/layout/nav-items.ts`) so both `NavPills` (topbar) and the sidebar consume
it — no duplication, no behaviour change. Add a lucide icon per item
(LayoutDashboard, ListChecks, FolderKanban, Users, UserRound/Contact, BarChart3, Shield).
Admin renders as its own group. Active state matches the current pill logic (exact match
or `startsWith` for section roots).

### 3.4 Files touched

| File | Change | Kind |
|---|---|---|
| `src/app/(app)/layout.tsx` | branch on tenant; render shell for Riverbank, topbar otherwise | UI |
| `src/components/layout/riverbank-shell.tsx` | new client shell (sidebar + top header + content offset) | new |
| `src/components/layout/nav-items.ts` | extract shared route/icon/permission list | new |
| `src/components/layout/nav-pills.tsx` | consume the shared list (no visual change) | UI (refactor) |
| `src/app/globals.css` | Riverbank sidebar/topbar gradient tokens (scoped) | CSS |

No changes to server code, Prisma, routes, RBAC, or data. KCB path is byte-unchanged.

## 4. Behaviour & accessibility

- **Collapse**: toggle button in the sidebar header; persists; icon-only rail shows tooltips.
- **Mobile**: `< md` hides the sidebar; hamburger in the top header opens a drawer with a
  backdrop; Escape and resize-to-desktop close it; focus is trapped while open.
- **Active nav**: `aria-current="page"`; keyboard focus rings consistent with the rest of the app.
- **Skip link** to `#main-content`; the main region has `id="main-content"`.
- Respects `prefers-reduced-motion` for the collapse/drawer transitions.

## 5. Non-goals

- No component (button/table/form) restyle — later phases, `rv:`-scoped.
- No route, RBAC, data, or logic changes.
- KCB and pre-auth shells untouched.
- No new nav destinations; the item set equals today's topbar.

## 6. Verification

- **Visual:** sign in as Riverbank → sidebar renders (gradient, icons, red active pill),
  collapse works + persists, mobile drawer opens/closes, top header shows title + utilities;
  sign in as KCB → **unchanged** topbar. Light + dark both correct.
- **Nav parity:** every topbar destination is reachable from the sidebar; Admin/Teams gate
  on `admin:access` exactly as before.
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; no reference-project names in
  any committed file.
- **A11y:** keyboard nav, skip link, drawer focus behaviour, `aria-current` verified.
