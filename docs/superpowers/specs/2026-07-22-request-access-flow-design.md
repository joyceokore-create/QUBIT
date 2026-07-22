# Request-access ("Get started") flow — design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Nancy

## Problem

The three "Get started" CTAs (marketing hero + header desktop/mobile) currently point at
`/login`, the same place as "Sign in". QUBIT has no self-serve signup — organizations are
admin-provisioned — so a prospect clicking "Get started" lands on a login form they cannot
use. We want "Get started" to open a **request-access** (lead-capture) form, persist each
submission, and give a super-admin an in-app place to review requests.

## Goals

- "Get started" opens a dedicated request-access form; "Sign in" is unchanged.
- Collect: **Full name** (required), **Work email** (required), **Company name** (required),
  **Job title / role** (optional).
- Persist every submission durably; surface pending requests to super-admins in-app.
- Visually cohesive with the login screen (shared dark canvas, brightened light card, both themes).
- Honour QUBIT rules: Zod validation, no realistic PII in code/seeds, auditable admin mutations,
  secure-by-design public endpoint.

## Non-goals

- No account creation / provisioning from this flow (still admin-driven, out of scope).
- No email/webhook notification in this pass (no email library is wired; would add an external
  dependency + secret). In-app review is the notification channel.
- No heavy rate-limiting infra (honeypot only; see Abuse).

## Routing & CTAs

- New route: `src/app/(auth)/request-access/`
  - `page.tsx` — server component (metadata + renders the client form).
  - `request-access-form.tsx` — `"use client"` form component.
- Repoint the three **"Get started"** CTAs from `/login` → `/request-access`:
  - `src/components/marketing/hero.tsx` (~line 104)
  - `src/components/marketing/marketing-header.tsx` desktop (~line 114) and mobile (~line 171)
- **"Sign in"** links stay `/login`.
- The request-access page shows "Already have an account? **Sign in**" → `/login`.

## Shared AuthShell (refactor)

Extract the login canvas into a reusable shell so login and request-access stay identical and
the recent theming work is not duplicated.

- New `src/app/(auth)/auth-shell.tsx` (client) rendering:
  - the `.login-shell` wrapper (dark backdrop + navy/brand radial glows, shared in both themes),
  - the Lufga font-var scoping,
  - the top-right `ThemeToggle` (topbar variant — light-on-glass in both themes),
  - a centered card slot (`children`) using the `--l-*` card tokens (bright light card / dark
    glass card),
  - the giant faded ghost wordmark.
- `login-form.tsx` is refactored to render its form inside `<AuthShell>`. Behavior/markup of the
  login form itself is unchanged; only the wrapper moves into the shell.
- `request-access-form.tsx` renders its form inside the same `<AuthShell>`.
- The `--l-*` tokens and `.login-shell` rules in `globals.css` are unchanged (already theme-aware).

## Form UI (`request-access-form.tsx`)

Fields (in order), all inside the shared card, product-green brand (`--login-brand: var(--pbrand)`):

| Field | Input | Required | Validation |
|---|---|---|---|
| Full name | text | yes | 1–120 chars after trim |
| Work email | email | yes | valid email, ≤190 chars, lowercased+trimmed |
| Company name | text | yes | 1–160 chars after trim |
| Job title / role | text | no | ≤120 chars |

- Reuses the login `INPUT_CLASS` token styling (`--l-field-*`, `--l-ph`, brand focus ring).
- **Org hint (approved):** on work-email blur, debounce-call the existing
  `GET /api/auth/resolve-org?email=…`. If the domain resolves to a known tenant, show an inline
  note: "Your organization already uses QUBIT — **sign in** instead" (link → `/login`). Purely a
  nicety; it does not block submission.
- Hidden **honeypot** field (e.g. `company_url`), visually hidden + `tabindex=-1` + `autocomplete=off`.
- Submit button "Request access" with loading ("Sending…") and disabled states.
- Inline field errors on blur/submit; a general error line for network/500.
- **Success state:** on `{ ok: true }`, the card content is replaced by a confirmation —
  "Request received. We'll be in touch at **{email}**." + a "Back to sign in" link. No redirect.
- Motion: reuses the existing `rise` keyframe (already has a `prefers-reduced-motion` fallback).

## Data model

New Prisma model in `prisma/schema.prisma` — **system-level, no `tenant_id`** (a requester
belongs to no tenant yet):

```prisma
model AccessRequest {
  id           String              @id @default(cuid())
  fullName     String              @map("full_name")
  email        String
  company      String
  jobTitle     String?             @map("job_title")
  status       AccessRequestStatus @default(NEW)
  reviewedById String?             @map("reviewed_by_id")
  reviewedAt   DateTime?           @map("reviewed_at")
  createdAt    DateTime            @default(now()) @map("created_at")

  @@index([status, createdAt])
  @@map("access_request")
}

enum AccessRequestStatus {
  NEW
  REVIEWED
  DISMISSED
}
```

### Multitenancy exception (explicitly approved)

CLAUDE.md rule 1 and `docs/04-multitenancy.md` require `tenant_id` + RLS on every table.
`access_request` is the **one sanctioned exception**: it captures pre-tenant intake, so there is
no tenant to scope by. Consequences, to be documented in `docs/04-multitenancy.md`:

- The table has no `tenant_id` and no tenant-scoped RLS policy.
- Public **INSERT** happens via the bare `prisma` client (no `app.tenant_id` GUC set) — acceptable
  because the table carries no cross-tenant data path.
- **Read/update** access is gated at the application layer by RBAC (`can(ctx, "iam:manage")`), not
  by tenant RLS.
- The migration keeps RLS **disabled** on this table (documented), so it is intentionally excluded
  from the standard cross-tenant isolation test; a test instead asserts the review surface requires
  `iam:manage`.

### Audit

- The `AccessRequest` row is itself the immutable intake record (append-only; created via public
  endpoint, no actor).
- **Authenticated** admin mutations on it write a normal `audit_log` row under the reviewing
  admin's context: `actorId = ctx.userId`, `tenantId = ctx.tenantId`, `action =
  "access_request_review"`, `entityType = "access_request"`, `entityId = <request id>`,
  `before/after = { status }`. This satisfies "every mutation is audited" for the mutations that
  have an actor + tenant.

## Public API endpoint

`src/app/api/access-request/route.ts` — `POST`, **unauthenticated**.

- Zod schema:
  ```ts
  z.object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(190),
    company: z.string().trim().min(1).max(160),
    jobTitle: z.string().trim().max(120).optional().or(z.literal("")).transform(v => v || undefined),
    company_url: z.string().optional(), // honeypot — must be empty
  })
  ```
- If the honeypot (`company_url`) is non-empty → return `{ ok: true }` **without** writing a row
  (silent bot drop).
- On valid input → `prisma.accessRequest.create({ data: … })` (bare client) → `{ ok: true }` (201).
- On invalid input → `400` with a generic `{ error: "Invalid request." }` (no field echo).
- No secrets, no tenant context, no PII beyond the submitted contact fields.

## Admin review surface

- Page: `src/app/(app)/admin/access-requests/page.tsx` (server component), mirroring
  `admin/audit/page.tsx`:
  - `auth()` → build `ctx` → `if (!can(ctx, "iam:manage")) return <Forbidden />`.
  - `AdminHeader` + the shared `CARD` styling.
  - Table columns: When · Name · Company · Role · Email · Status + Reviewed/Dismiss actions.
  - Sorted `NEW` first, then `createdAt` desc.
- Server module `src/server/access-requests.ts`:
  - `listAccessRequests(): Promise<AccessRequest[]>` — system read via bare `prisma`.
  - `reviewAccessRequest(ctx, id, status)` — updates `status`, `reviewedById`, `reviewedAt`;
    writes the `audit_log` row. Guard: caller must have `iam:manage` (checked in the route/page).
- Status changes fire from an authenticated route handler `PATCH /api/admin/access-requests/[id]`
  with body `{ status: "REVIEWED" | "DISMISSED" }` — matching the repo's established admin-mutation
  pattern (route handlers under `src/app/api/admin/...`, e.g. `users/[id]/suspend`; no server
  actions are used in this codebase). The route reads `ctx` via the session, re-checks
  `can(ctx, "iam:manage")`, and calls `reviewAccessRequest`.
- Admin nav: add an "Access requests" entry with a **New** count badge (the in-app notification).
  Location follows the existing admin nav definition (`admin-header.tsx` / admin nav source).

## Error / edge states

- Form: empty required fields (inline), invalid email (inline), overlong values (maxLength +
  schema), network failure (general error line), double-submit (button disabled while pending).
- API: malformed JSON / invalid body → 400; honeypot → silent 200; DB error → 500 + generic error.
- Admin: non-admin → `<Forbidden />`; empty list → friendly empty state; reviewing an already-
  reviewed request is idempotent.

## Testing (Vitest + RTL + Playwright)

- **Schema unit:** accepts a valid payload; rejects missing required, bad email, overlong values;
  trims + lowercases email; drops empty `jobTitle` to `undefined`.
- **API route:** valid → row created + `{ ok: true }`; honeypot filled → no row, `{ ok: true }`;
  invalid → 400 with generic error.
- **RBAC:** review page/data requires `iam:manage` (non-admin → Forbidden / throws).
- **Audit:** `reviewAccessRequest` writes exactly one `audit_log` row with the expected fields.
- **Form (RTL):** required validation, org-hint appears when resolve-org returns a tenant, success
  state renders the confirmation.
- **E2E (Playwright, optional):** fill + submit → confirmation; "Get started" navigates to
  `/request-access`.

## Definition of done

- "Get started" → `/request-access` in all three CTA sites; "Sign in" unchanged.
- Form works and looks correct in both tenants' pre-auth theming, light + dark.
- Requests persist; super-admin review page lists them and can mark Reviewed/Dismissed.
- Admin review mutations write audit rows; public intake writes no cross-tenant data.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; new migration applies cleanly.
- `docs/04-multitenancy.md` updated to document the `access_request` system-table exception.
- No secrets or realistic PII committed.
