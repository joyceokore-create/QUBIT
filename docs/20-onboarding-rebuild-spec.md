# 20 — Onboarding & IAM Module Rebuild Spec

**Status:** In progress · 2026-08-03
**Owner:** Joyce Okore
**Builds on:** `07-auth-rbac.md`, `17-role-dashboards-spec.md`, `19-consolidation-and-module-revamp-plan.md`
**Execution rule:** one milestone at a time, stop for review. DoD per `CLAUDE.md`.
**Goal:** everyone lands on the **right role**, with the **right permissions**, through a
clean, well-structured onboarding and user-management (CRUD) experience.

---

## 1. Scope (confirmed 2026-08-03)

Four decisions frame this rebuild:

1. **Guided first-login flow:** set password → enrol MFA (TOTP) → confirm role & dashboard
   persona → land on the right dashboard, with a short first-login checklist.
2. **Real email invites:** an invite emails a one-time secure set-password link (Microsoft
   Graph mailer, `FEATURE_EMAIL`); no more manual temp-password copying. Graceful
   fallback to a copyable link when the mailer isn't configured.
3. **User management + shared CRUD foundation:** rebuild users / roles / groups / status /
   reset on a shared mutation hook + shared table/dialog/shell components. Teams and
   departments adopt the same pattern later.
4. **Keep the permission model, fix the bugs:** the role→permission design is sound
   (audit 2026-08-03). Fix the real defects — the `mustChangePassword` bypass, the
   privilege-escalation gap, scattered gating — and add tests. Do **not** redesign RBAC.

Out of scope for this module: the access-request→invite funnel (tracked separately),
two-way task sync, and any change to the "global read, scoped write" model.

## 2. What's wrong today (audit evidence)

- **Onboarding is a single password-only form** (`src/app/onboarding/onboarding-form.tsx`).
  The invitee never sees or confirms their role/persona; MFA is a text tip, enforced
  nowhere; the "checklist" is admin-facing only (completeness is *measured*, never
  *guided*).
- **`mustChangePassword` can be bypassed client-side** — the JWT callback trusts
  `update({mustChangePassword:false})` from the browser (`src/lib/auth.config.ts:28-30`),
  so an invited user can lift the reset gate without ever changing the admin-issued temp
  password. **High severity.**
- **Privilege escalation:** `createUser` (gated `users:invite`, held by HeadOfProjects /
  HeadOfQA) accepts `roles` including `PlatformSuperAdmin` with no guard — a non-superadmin
  can mint a superadmin. `updateUserRoles` guards self-demotion but not granting.
- **"Invite" sends nothing** — `createUser` never calls the mailer; the admin copies a temp
  password from a done-screen. No resend, no password reset, no self-service recovery.
- **Admin CRUD is structurally repetitive** — ~11 dialogs each re-implement the same
  `useState(loading/error)` + `fetch` + `res.ok ? refresh : setError` pattern;
  `new-department` and `edit-department` dialogs are ~95% identical; teams uses a different
  page shell than the other admin screens; group/label maps are duplicated across dialogs.
- **Persona/group set at invite by the admin only** — the invitee has no say and never sees
  where they'll land.

## 3. Target design

### 3.1 Roles, permissions, personas (unchanged model)

The three concepts stay exactly as designed (`src/lib/rbac.ts`, `roles.ts`, `personas.ts`):

- **Tenant role (RBAC)** — what you can *do*. Six canonical roles; "global read, scoped
  write"; resource-scoped writes via `src/lib/access.ts`.
- **Project role** — the *hat* you wear on a project; collapses to a category
  (PM/Dev/QA/Implementor/Stakeholder) that drives boards and QA scope.
- **Dashboard persona / user group** — where you *land*; presentation only, never
  permission. Effective = declared (invite) ∪ derived (memberships + tenant roles),
  resolved at login.

"Everyone lands on the right role" therefore means three guarantees, each now testable:
(a) the resolved persona is correct given the user's data; (b) temp credentials actually
retire on first login (no bypass); (c) nobody can be granted a role above the inviter's
authority.

### 3.2 Invite → set-password (token, not temp password)

- New `InviteToken` (tenant-scoped, RLS, isolation test): `userId`, `tokenHash`
  (SHA-256 of a 256-bit `randomBytes` value, never the raw token), `expiresAt`
  (e.g. 72h), `consumedAt`, `createdById`. The raw token travels only in the emailed link.
- `User.status` gains `INVITED`. `createUser` → status `INVITED`, no usable password, mint
  a token, send the invite email (Graph mailer) with a `/onboarding/accept?token=…` link.
  Mailer off/unconfigured → return the one-time link for the admin to copy (dev/fallback).
- Admin actions: **Resend invite** (mint a fresh token, invalidate the old) and **Reset
  password** (same mechanism for an active user). Both audited.
- Consuming the token is what starts the guided flow (§3.3); on completion status → `ACTIVE`.

### 3.3 Guided first-login flow (multi-step, replaces the single form)

Steps, each a discrete server-validated stage:

1. **Set password** — policy + no-reuse (existing `completeOnboarding` logic), via the token.
2. **Enrol MFA (TOTP)** — server mints and stores a **pending** enrolment bound to the
   session/token (fixes audit A5: the secret is never client-supplied at verify time),
   user scans + confirms a code, then **recovery codes** are shown once (hashed at rest).
   Policy: required for `PlatformSuperAdmin` / `HeadOfProjects` / `HeadOfQA` / `Executive`;
   strongly prompted (skippable once) for others.
3. **Confirm role & landing** — a read-only summary: "You're a **Project Manager**; you'll
   land on the **PM** dashboard." Makes "the right role" explicit to the user.
4. **Land** — redirect to the resolved persona dashboard with the per-persona first-login
   checklist (docs/17 §1.3) shown once.

The `(app)` layout gate stays the enforcement point, but reads a DB-truthful flag (§4).

### 3.4 Shared CRUD foundation

- `useAdminMutation` hook — one place for loading/error/optimism/`router.refresh()`; every
  dialog uses it instead of hand-rolling fetch state.
- `<AdminTable>`, `<AdminDialog>`, and a single `AdminHeader`/shell — teams and departments
  align to it; `new`/`edit` department dialogs collapse into one.
- Shared label maps (`GROUP_LABELS`, permission labels) live in one module.
- Role-grant UI honours §3.1(c): the invite/edit-roles dialogs hide roles the current
  admin isn't allowed to grant (e.g. `PlatformSuperAdmin` for a non-superadmin).

## 4. Security fixes (gate the rebuild)

| Fix | Approach |
|---|---|
| `mustChangePassword` bypass | Stop trusting client session data. The JWT callback re-reads the flag from the DB on `trigger === "update"`. Because the edge `auth.config.ts` can't load Prisma, the DB-reading callback is composed in the Node-runtime `auth.ts`; the edge config only hydrates on initial sign-in. |
| Privilege escalation | Only an actor holding `PlatformSuperAdmin` may grant `PlatformSuperAdmin`, enforced in both `createUser` and `updateUserRoles` (server-side; UI hiding is defence in depth). |
| Suspended-user token | (Follow-up) re-read `status` in the same callback and treat non-ACTIVE as signed-out. |

## 5. Milestones

| # | Milestone | Scope | Verifiable here? |
|---|---|---|---|
| **M-O1** | **Correctness & permissions** | `mustChangePassword` DB-truth fix; SuperAdmin-grant guard (create + update); tests; no schema change | typecheck ✓, DB tests on CI |
| **M-O2** | **Shared CRUD foundation** | `useAdminMutation`, `<AdminTable>`/`<AdminDialog>`, unified shell; rebuild user dialogs; dedupe dept dialogs; align teams; role-grant UI gating | typecheck/lint ✓ |
| **M-O3** | **Invite tokens + email** | `InviteToken` model + `User.status=INVITED`; enable Graph mailer; invite email + secure link; resend + reset actions; retire temp-password screen | needs DB + email |
| **M-O4** | **Guided first-login** | Multi-step flow (password → MFA enrolment w/ server-bound secret + recovery codes → confirm role → land); per-persona checklist | needs DB + e2e |

Sequencing: fix correctness first (M-O1), clean the structure (M-O2), then build the new
invite backbone (M-O3) and the guided flow on top (M-O4). Each milestone stops for review.

## 6. Definition of done (per milestone)

Standard `CLAUDE.md` DoD, plus module-specific acceptance:
- Persona resolution correct for exec/PM/dev/QA/implementor (extends `tests/rls/personas.test.ts`).
- A completed first-login truly clears `mustChangePassword` in the DB **and** a forged
  client `update` does not (regression test / e2e).
- A non-superadmin cannot create or promote a `PlatformSuperAdmin` (RLS test, both paths).
- Every admin mutation writes an audit row; RLS isolation holds for any new table.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` green on CI.

---

## 7. M-O1 change log (this increment)

- `src/lib/auth.config.ts` — removed the client-trusted `mustChangePassword` branch; the
  edge callback now only hydrates the token on initial sign-in.
- `src/lib/auth.ts` — composed JWT callback re-reads `mustChangePassword` from the DB on
  `trigger === "update"` (Node runtime, RLS-scoped to the user's own row).
- `src/app/onboarding/onboarding-form.tsx` — `update({})` now just triggers a DB-truthful
  refresh; the browser no longer asserts the flag value.
- `src/server/users.ts` — `createUser` and `updateUserRoles` reject granting
  `PlatformSuperAdmin` unless the actor holds it (`FORBIDDEN_GRANT`).
- `tests/rls/onboarding-security.test.ts` — new: non-superadmin cannot mint/promote a
  superadmin via either path; a superadmin can.

## 8. M-O2 change log (this increment)

Shared foundation + user-management dialogs rebuilt onto it. No behaviour change beyond
consistency and the role-grant UI gating; typecheck + lint green.

- `src/components/admin/use-admin-mutation.ts` — **new** shared hook: owns busy/error
  state, the fetch, the `{ error: { message } }` envelope read, and the route refresh on
  success. Replaces the hand-rolled `useState(loading/error) + fetch + res.ok ? refresh :
  setError` block that was duplicated in every dialog.
- `src/components/admin/labels.ts` — **new** single source of truth for `GROUP_LABELS`
  (was duplicated in `new-user-dialog` and `edit-groups-dialog`).
- Migrated onto the hook + shared labels: `new-user-dialog.tsx`, `user-row-actions.tsx`
  (suspend/reactivate/delete), `edit-roles-dialog.tsx`, `edit-groups-dialog.tsx`,
  `edit-department-dialog.tsx`.
- **Role-grant UI gating** (defence in depth over the M-O1 server guard): the invite
  dialog hides the "Administrator" (PlatformSuperAdmin) tier, and the edit-roles dialog
  hides/locks the Super Admin checkbox, for admins who aren't Super Admins. Threaded
  `canGrantSuperAdmin` through `page.tsx → UsersClient → UserRowActions → EditRolesDialog`
  and `page.tsx → NewUserDialog`.

## 9. M-O2b change log (this increment) — see docs/21

Shipped the deferred slice. Pure structural refactor; no behaviour, permission, or schema
change beyond two latent bug fixes noted below.

- `src/components/admin/admin-table.tsx` — **new** generic directory table; tokens and
  spacing lifted verbatim from the users directory so adopting screens are visually
  identical.
- `src/components/admin/admin-form-dialog.tsx` — **new** dialog chrome (title/description,
  `role="alert"` error slot fed by `useAdminMutation().error`, Cancel + submit footer with
  busy label). Fields stay with the caller.
- `departments/department-dialog.tsx` — **new**, replaces `new-department-dialog.tsx` and
  `departments/edit-department-dialog.tsx` (both **deleted**). Mode is a prop: create →
  POST + own trigger, edit → PATCH + controlled open. Field markup exists once.
- `teams/page.tsx` — now `AdminHeader` + the standard `max-w-[1360px]` wrapper +
  `TeamsTable` (new client wrapper over `AdminTable`). Breadcrumb and local `CARD`/`ROW`
  constants gone.
- Migrated onto `useAdminMutation`: `team-form-dialog`, `team-row-actions`,
  `department-row-actions`, `roles-editor`, `access-requests-client`. **No admin component
  hand-rolls fetch state any more** (docs/21 §5 acceptance).
- **Two latent bugs fixed in passing**: team delete and access-request review both awaited
  `fetch` without checking `res.ok`, so a server-side failure closed the dialog and looked
  successful. Both now surface the server's message through the hook's error slot.

Note: `users/edit-department-dialog.tsx` is a DIFFERENT component (assigns a user to a
department, already on the hook) and was correctly left alone.

## 10. M-O3 change log (this increment) — see docs/22

Token invites shipped. `createUser`'s contract CHANGED: no admin-supplied password.

- `prisma/schema.prisma` + `migrations/20260803120000_mo3_invite_tokens` — `InviteToken`
  (unique `tokenHash`, purpose, expiry, `consumedAt`), RLS enabled + forced inline.
  `User.status` gains `INVITED`.
- `prisma/rls.sql` — **resynced**: the array had drifted 15 tables behind (every table
  since M4 applies RLS in its own migration, so the live DB was never unprotected, but
  this file had stopped being a complete statement of policy). Now 72/72 + a drift note.
- `src/lib/invite-token.ts` — 256-bit `base64url` raw token, SHA-256 stored, 72h TTL.
- `src/server/invites.ts` — `mintInvite` (retires prior unconsumed tokens), `resendInvite`,
  `startPasswordReset`, `consumeInviteToken`.
- `src/server/users.ts` — `createUser` now returns `{ user, emailed, acceptUrl? }`; the
  user is `INVITED` with `passwordHash: null`. **Six test files updated** for the new
  envelope — the contract change docs/22 §4.1 called for.
- Routes: public `/onboarding/accept` (page + API, rate-limited, middleware-excluded),
  `POST /api/admin/users/[id]/resend`, `POST .../reset-password` (gated `users:reset`).
- UI: temp-password field and `generatePassword` deleted; the done screen shows "invite
  emailed" or the copyable link; row actions gained Resend invite / Send password reset;
  an `INVITED` pill in the directory. `useAdminMutation.onSuccess` now receives the
  response body (the invite result needs it).

**One spec deviation, deliberate** (docs/22 §4.2 said to read the token via an RLS-exempt
`prisma.inviteToken.findUnique`): `invite_token` is a tenant table under FORCE RLS, so a
direct read outside `withTenant` matches ZERO rows — the DM1.18 trap. `access_request` is
exempt only because it has no `tenant_id` at all. Making `invite_token` exempt would have
meant weakening isolation on a table holding credentials-grade capabilities, so
`consumeInviteToken` instead probes each tenant's RLS context, the pattern
`resolveGithubIntegration` already uses for unauthenticated webhooks.

## 11. M-O4 change log (this increment) — see docs/23

Guided first-login shipped: password → MFA → confirm, with the gate lifted only at
finish. The A5 MFA hole (client-supplied secret) is closed.

- `prisma/schema.prisma` + `migrations/20260803140000_mo4_mfa_enrolment` — `User` gains
  `pendingMfaSecret`, `mfaRecoveryCodes String[]`, `onboardedAt`, `checklistDismissedAt`.
- `migrations/20260803150000_mo4_password_set_at` — `passwordSetAt`, backfilled from
  `COALESCE(last_login_at, created_at)` for users who already hold a self-set password
  (`password_hash IS NOT NULL AND must_change_password = false`). This column is the
  proof "the user chose this password themselves" — a hash alone is not proof, because
  legacy admin-issued temp passwords also hash.
  **Fix-up `20260803160000_mo4_password_set_at_backfill_rls`**: the first backfill ran a
  plain `UPDATE` on the FORCE-RLS `user` table outside any tenant context and matched
  ZERO rows everywhere (DM1.18 — the trap applies to migration DML regardless of whether
  the semantics are "whole-table"). Caught by verifying row counts on prod after deploy;
  the fix-up re-runs it inside the tenant loop, idempotently.
- `src/lib/mfa-recovery.ts` — 10 single-use recovery codes (`a1b2c-3d4e5`), SHA-256
  hashes stored, tolerant matching (case/spaces). `src/lib/mfa-policy.ts` —
  `mfaRequired(roles)`: PlatformSuperAdmin, HeadOfProjects, HeadOfQA, Executive.
- **A5 fix** — `/api/auth/mfa/enroll` stores the secret ENCRYPTED in `pendingMfaSecret`
  and returns only the QR; `/api/auth/mfa/verify` accepts `{ token }` alone, reads the
  pending secret from the DB, promotes it to `mfaSecret`, and returns the recovery codes
  exactly once. A client can no longer supply the secret it will be verified against.
- `/api/auth/mfa/reset` (gated `users:reset`) — clears live + pending secret and codes
  so a locked-out user can re-enrol.
- `src/lib/auth.ts` `authorize()` — a recovery code is accepted in place of a TOTP code
  and its hash is consumed in the same transaction.
- `src/server/users.ts` — `completeOnboarding` → `setOnboardingPassword` (stamps
  `passwordSetAt`, does NOT lift the gate); new `finishOnboarding` re-checks password +
  role-conditional MFA from the DB and only then clears `mustChangePassword` and stamps
  `onboardedAt`. `OnboardingIncomplete.missing` tells the UI which step to show.
- UI: `/onboarding` is a stepper (password → two-factor → confirm). `needsPassword` keys
  off `passwordSetAt`, not `passwordHash`. Non-privileged roles may skip MFA once;
  privileged roles cannot. The page mounts `TenantScope` so `bg-primary` controls render
  in the tenant brand (they were product-green before).

- First-login checklist (docs/23 §7): dismissal moved from localStorage to
  `checklistDismissedAt` via `POST /api/me/checklist` (audited, idempotent), so it holds
  across devices. Shown only when `onboardedAt` is set and the flag is null — users who
  completed the guided flow see it exactly once; legacy users are not greeted weeks in.

**Regression caught in browser verify, then closed with a test**: the first cut of
`finishOnboarding` accepted "a password hash exists" as the password proof, which a
legacy user holding an ADMIN-issued temp password satisfies — they could lift their own
gate without ever changing the password (the M-O1 bypass through another door). Fixed by
requiring `passwordSetAt` (see the migration above);
`tests/rls/mfa-enrolment.test.ts` pins it.
