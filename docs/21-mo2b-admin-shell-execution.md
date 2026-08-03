# 21 — M-O2b Execution Spec: Admin Shell Primitives (Teams + Departments)

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read this file, implement, stop for review)
**Module:** Onboarding & IAM rebuild (docs/20). Depends on M-O1 + M-O2 (already in tree).
**Type:** Pure structural refactor — **no behaviour, permission, or schema change.**

---

## 0. Context you must load first

- Read `docs/20-onboarding-rebuild-spec.md` §3.4 and §8 (what M-O2 already shipped).
- **Already exists, reuse — do not recreate:** `src/components/admin/use-admin-mutation.ts`
  (busy/error/fetch/refresh hook) and `src/components/admin/labels.ts` (`GROUP_LABELS`).
- **Already consistent, copy its pattern:** `src/app/(app)/admin/users/*` — page uses
  `AdminHeader` (`src/app/(app)/admin/admin-header.tsx`) + `main.mx-auto...max-w-[1360px]`,
  and every dialog uses `useAdminMutation`.

## 1. Goal

Two admin screens still diverge from the users screen and from each other:

1. `src/app/(app)/admin/teams/page.tsx` uses a `Breadcrumb` + locally-redefined `CARD`/`ROW`
   constants and different padding instead of `AdminHeader` + the standard shell.
2. `src/app/(app)/admin/departments/new-department-dialog.tsx` and
   `src/app/(app)/admin/departments/edit-department-dialog.tsx` are ~95% identical.
3. Every teams/departments dialog and row-action still hand-rolls the
   `useState(loading/error) + fetch + res.ok ? refresh : setError` block that M-O2 replaced
   on the users screen.

Fix all three by extracting two shared primitives and adopting them.

## 2. Files to CREATE

### 2.1 `src/components/admin/admin-table.tsx`

A presentational table matching the current users directory look
(`src/app/(app)/admin/users/users-client.tsx` — the `ROW_GRID` + `CARD` + header-row +
divider-rows + empty-state pattern). Generic over a row type.

```tsx
"use client";
import type { ReactNode } from "react";

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** Tailwind grid-template width, e.g. "minmax(0,1.6fr)" or "120px". */
  width: string;
  render: (row: T) => ReactNode;
  align?: "start" | "end";
}

export function AdminTable<T>({
  title, columns, rows, getRowKey, empty = "Nothing here yet.",
}: {
  title: string;
  columns: AdminColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: string;
}) { /* build ROW_GRID from columns[].width; render header + rows + empty state */ }
```

Copy the exact tokens/classes already used in `users-client.tsx` (`--cardbd`, `--hair`,
`--wash`, etc.) so the visual result is unchanged. Do **not** invent new colours.

### 2.2 `src/components/admin/admin-form-dialog.tsx`

A thin wrapper around the existing `@/components/ui/dialog` that standardises: title +
description, an error slot fed by `useAdminMutation().error`, and a footer with Cancel +
primary submit button (label + busy state). It does **not** own the form fields — callers
pass `children` (the fields) and an `onSubmit` that calls their `useAdminMutation().mutate`.

```tsx
"use client";
export function AdminFormDialog({
  open, onOpenChange, title, description, error, busy,
  submitLabel = "Save", onSubmit, children, maxWidthClassName,
}: { /* ...typed props... */ }) { /* Dialog + header + {children} + error <p role="alert"> + footer */ }
```

Keep the markup identical to the current user dialogs (same `DialogContent`, footer button
styles). The wrapper is for consistency, not restyling.

## 3. Files to EDIT

### 3.1 Collapse the two department dialogs into one

- CREATE `src/app/(app)/admin/departments/department-dialog.tsx` exporting
  `DepartmentDialog({ mode: "create" | "edit", department?, departments, users, open, onOpenChange })`.
  - `mode === "create"` → `POST /api/admin/departments`.
  - `mode === "edit"` → `PATCH /api/admin/departments/[id]`.
  - Prefill fields from `department` when editing; empty when creating.
  - Use `useAdminMutation` + `AdminFormDialog`. Preserve the indented parent-tree picker,
    orgUnit + head selects exactly as in the current dialogs.
- DELETE `new-department-dialog.tsx` and `departments/edit-department-dialog.tsx`.
- UPDATE `src/app/(app)/admin/departments/page.tsx` and `department-row-actions.tsx` to
  import `DepartmentDialog` with the right `mode`.

### 3.2 Align the teams page shell

- EDIT `src/app/(app)/admin/teams/page.tsx`: replace the `Breadcrumb` + local `CARD`/`ROW`
  with `AdminHeader` (subtitle: `"<n> teams · …"`, `action` = the create-team dialog
  trigger) and the `main.mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]`
  wrapper — identical to `admin/users/page.tsx`. Render the list with `AdminTable`.
- EDIT `team-form-dialog.tsx` and `team-row-actions.tsx` to use `useAdminMutation` +
  `AdminFormDialog`. Keep the edit-mode `GET /api/admin/teams/[id]` prefill on open.

### 3.3 (Optional, same pass) departments row-actions + teams row-actions

Migrate their delete/confirm flows to `useAdminMutation` (DELETE) so no admin component
hand-rolls fetch state any more. Keep the child/member delete-guard error surfacing in
`department-row-actions.tsx` (the server returns the message; show it via the hook's `error`).

## 4. Guardrails

- No change to any `/api/admin/**` route, server function, Prisma schema, or permission
  gate. This milestone only moves UI code behind shared components.
- The `admin/teams` page gate stays `iam:manage`; `admin/departments` stays as-is.
- Riverbank + product-green theming must look identical before/after (tokens only).

## 5. Acceptance criteria

- `new-department-dialog.tsx` and the departments `edit-department-dialog.tsx` no longer
  exist; one `DepartmentDialog` serves both, with zero duplicated field markup.
- `admin/teams/page.tsx` renders through `AdminHeader` + `AdminTable`; no `Breadcrumb`, no
  local `CARD`/`ROW` constants remain in it.
- No admin component under `src/app/(app)/admin/**` contains a raw
  `useState(false) // loading` + `fetch(` block; every mutation goes through
  `useAdminMutation`.
- Existing tests still pass: `tests/rls/departments.test.ts`, `tests/rls/teams-resources.test.ts`.

## 6. Verify (run before declaring done)

```bash
pnpm typecheck && pnpm lint
pnpm test -- departments teams          # the two affected RLS suites
```

Then commit (Conventional Commits): `refactor(admin): shared AdminTable/AdminFormDialog; unify teams + departments (M-O2b)`.
