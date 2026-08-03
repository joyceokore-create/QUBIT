# 23 — M-O4 Execution Spec: Guided First-Login (Password → MFA → Confirm Role → Land)

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read this file, implement, stop for review)
**Module:** Onboarding & IAM rebuild (docs/20). Depends on M-O1, M-O2, **M-O3** (token accept flow).
**Type:** Flow rebuild + small schema additions. **Has a Prisma migration.**

---

## 0. Context you must load first

- `src/app/onboarding/page.tsx` + `onboarding-form.tsx` — today a single password form.
  After M-O1 the form calls `update({})` to trigger the DB-truth `mustChangePassword`
  re-read (do not regress that). After M-O3 the token accept page reuses these fields.
- `src/app/(app)/layout.tsx:24` — the gate: `if (session.user.mustChangePassword) redirect("/onboarding")`.
- `src/lib/mfa.ts` — `generateMfaEnrollment(label, issuer)`, `verifyTotp`, `encryptMfaSecret`,
  `decryptMfaSecret` (AES-256-GCM, `MFA_ENCRYPTION_KEY`).
- `src/app/api/auth/mfa/enroll/route.ts` — returns `{ secret, qrDataUrl }` to the client
  (the secret is client-held today — the A5 weakness this milestone fixes).
- `src/app/api/auth/mfa/verify/route.ts` — accepts `{ secret, token }` from the client and
  persists whatever `secret` was sent (A5). Must change to read the pending secret from the DB.
- `src/lib/auth.ts` `authorize()` — verifies `totpCode` against `user.mfaSecret` at login.
  Extend to also accept a recovery code.
- `src/lib/personas.ts` — `landingPersona`, `effectiveGroups`, `derivedGroups`; and
  `src/lib/rbac.ts` `primaryRoleLabel`. Use these to render the "confirm role" step.
- `src/components/dashboard/presets/first-login-checklist.tsx` — the per-persona checklist
  already exists; this milestone makes sure it's shown once after landing.
- `docs/17-role-dashboards-spec.md` §1.3 (onboarding flow), `docs/20` §3.3, `CLAUDE.md` DoD.

## 1. Goal

Turn first-login into a guided, secure, multi-step flow so **everyone lands on the right
role** having proven a second factor:

1. **Set password** (via the M-O3 token, or authenticated for a legacy `mustChangePassword`
   user) — does NOT lift the gate yet.
2. **Enrol MFA (TOTP)** with a **server-bound pending secret** (fixes A5), then show
   **recovery codes once**. Required for privileged roles; skippable-once for others.
3. **Confirm role & landing** — read-only summary: "You're a **{roleLabel}**; you'll land
   on the **{persona}** dashboard."
4. **Finish** → flip `mustChangePassword=false`, redirect to the resolved persona dashboard,
   show the first-login checklist once.

## 2. Schema (Prisma migration `mN_mfa_enrolment`)

Add to `model User`:

```prisma
pendingMfaSecret  String?   @map("pending_mfa_secret")   // encrypted; set at enrol-start, cleared on confirm
mfaRecoveryCodes  String[]  @default([]) @map("mfa_recovery_codes") // sha256 hashes, single-use
onboardedAt       DateTime? @map("onboarded_at")          // set when the guided flow finishes
```

No new table; all additive. Run `pnpm prisma migrate dev`. (No RLS array change — these
are new columns on the already-protected `user` table.)

## 3. MFA: server-bound enrolment (fix A5)

Rewrite the two MFA routes so the secret is never trusted from the client at verify time:

- `POST /api/auth/mfa/enroll` (authenticated): call `generateMfaEnrollment(user.email,
  \`QUBIT (\${tenant.name})\`)`, **store `encryptMfaSecret(secret)` into
  `user.pendingMfaSecret`** (withTenant), and return only `{ qrDataUrl }` (NOT the raw
  secret). Audited `mfa_enroll_start`.
- `POST /api/auth/mfa/verify` (authenticated): body is `{ token }` only. Read
  `user.pendingMfaSecret`, `decryptMfaSecret`, `verifyTotp(secret, token)`. On success:
  move it to `user.mfaSecret`, clear `pendingMfaSecret`, generate + return recovery codes
  (see §4), audit `mfa_enroll`. On failure: 400 `INVALID_CODE`, leave pending intact.
- Also add `POST /api/auth/mfa/reset` (admin, gate `users:reset` or `iam:manage`): clears a
  target user's `mfaSecret`/`pendingMfaSecret`/`mfaRecoveryCodes` so a locked-out user can
  re-enrol. Audited `mfa_reset`. (Closes the "lost authenticator = unrecoverable" gap.)

## 4. Recovery codes — `src/lib/mfa-recovery.ts` (new)

```ts
import { randomBytes, createHash } from "node:crypto";
export function generateRecoveryCodes(n = 10): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: n }, () =>
    randomBytes(5).toString("hex").replace(/(.{5})(.{5})/, "$1-$2")); // e.g. "a1b2c-3d4e5"
  const hashes = plain.map((c) => createHash("sha256").update(c).digest("hex"));
  return { plain, hashes };
}
export function matchRecoveryCode(input: string, hashes: string[]): number {
  const h = createHash("sha256").update(input.trim()).digest("hex");
  return hashes.indexOf(h); // -1 = no match; caller removes the used hash
}
```

Store only `hashes` in `user.mfaRecoveryCodes`; show `plain` once on the enrol step.

## 5. Login: accept a recovery code (`src/lib/auth.ts`)

In `authorize()`, when `user.mfaSecret` is set and the TOTP check fails, also try
`matchRecoveryCode(totpCode, user.mfaRecoveryCodes)`; if it matches (index ≥ 0), allow
login and **consume** that code (remove the used hash, persist). Keep the uniform
failure message (never reveal which factor failed). Audited `mfa_recovery_used`.

## 6. Onboarding flow rebuild

### 6.1 Server: finish endpoint + policy

- `src/lib/mfa-policy.ts` (new): `mfaRequired(roles: string[]): boolean` → true for
  `PlatformSuperAdmin | HeadOfProjects | HeadOfQA | Executive` (privileged). Others: optional.
- Change `completeOnboarding` (M-O1/M-O3) to set the password + push history but **NOT**
  flip `mustChangePassword` (rename to `setOnboardingPassword`, keep a thin wrapper if other
  callers exist). The gate is lifted only by finish.
- `POST /api/onboarding/finish` (authenticated): verify prerequisites — `passwordHash` set,
  and if `mfaRequired(roles)` then `mfaSecret` set. If satisfied: set `mustChangePassword=false`,
  `onboardedAt=now()`, audit `onboarding_complete`. Else 400 with the missing step.

### 6.2 Client: `src/app/onboarding/onboarding-form.tsx` → a stepper

Rebuild as a step machine (`password → mfa → confirm → done`) using the M-O2
`useAdminMutation` where useful (or a local equivalent). Steps:

1. **Password** — existing fields/validation → `POST setOnboardingPassword` route
   (authenticated) or the M-O3 accept route (token path). Advance on success; gate stays up.
2. **MFA** — `POST /enroll` → render `qrDataUrl` + code input → `POST /verify { token }` →
   show recovery codes with a "I've saved these" confirm. If `!mfaRequired(roles)`, show a
   "Skip for now" secondary action that advances without enrolling.
3. **Confirm role** — read-only: `primaryRoleLabel(roles)` + `landingPersona(...)` → persona
   label via `GROUP_LABELS` (`src/components/admin/labels.ts`). Copy: "You're a {role}; you'll
   land on the {persona} dashboard."
4. **Finish** — `POST /api/onboarding/finish` → on success `await update({})` (triggers the
   M-O1 DB-truth re-read; gate now lifts) → `router.replace("/dashboard")`.

Keep the `SessionProvider` wrapper only around the part that needs `useSession().update`.
Use the tenant brand var already set by `onboarding/page.tsx`.

### 6.3 Page copy

Update `src/app/onboarding/page.tsx`: replace the static "Tip: enable 2FA later" line with
a step indicator (reuse the `STEPS` pattern from the invite dialog). The MFA "tip" becomes
a real step.

## 7. First-login checklist (show once)

After landing, the dashboard should show `first-login-checklist.tsx` for the user's
persona exactly once. Drive it off `onboardedAt` + a dismissed flag (either a lightweight
`user.checklistDismissedAt` column or `localStorage` keyed by userId — prefer the column
for cross-device consistency; if adding it, fold into the §2 migration). Do not block the
dashboard on it.

## 8. Guardrails

- Do not regress M-O1: the gate is DB-truth; the client never asserts `mustChangePassword`.
- The MFA secret is server-bound end to end — the verify route must ignore any client-sent
  secret (accept only `{ token }`).
- Recovery codes: store hashes only; show plain once; single-use.
- Privileged roles cannot finish onboarding without MFA (server-enforced in §6.1).
- All new mutations audited; RLS unaffected (column-only changes on `user`).

## 9. Acceptance criteria

- A new invited user (M-O3 link) walks password → MFA → confirm → dashboard, and the
  `(app)` gate only lifts after `finish`.
- A privileged-role user cannot reach the dashboard without enrolling MFA; a non-privileged
  user can skip MFA once and still land.
- The verify route rejects a client-supplied secret — enrolment uses only the DB pending
  secret (regression test for A5).
- A user can log in with a recovery code when they've lost their authenticator; the code is
  then consumed (can't be reused).
- An admin MFA reset lets a locked-out user re-enrol.
- The confirm step shows the correct role + persona for exec / PM / dev / QA / implementor
  fixtures (extends `tests/rls/personas.test.ts`).
- The first-login checklist appears once, then not again.

## 10. Tests (write these)

- `tests/rls/mfa-enrolment.test.ts`: enroll stores encrypted pending secret; verify moves it
  to `mfaSecret` and returns recovery codes; verify rejects a mismatched/absent pending;
  admin reset clears factors.
- `tests/unit/mfa-recovery.test.ts`: code format, hashing, single-use match/consume.
- `tests/unit/mfa-policy.test.ts`: `mfaRequired` truth table across the six roles.
- `tests/rls/onboarding.test.ts` (extend): finish is blocked for a privileged role without
  MFA and allowed after; `mustChangePassword` flips only at finish.
- `tests/e2e/smoke.spec.ts` (extend, optional): invited-user guided flow to dashboard.

## 11. Verify

```bash
pnpm prisma migrate dev        # mN_mfa_enrolment
pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- mfa onboarding personas
pnpm test:e2e                  # if the smoke flow was extended
```

Commit: `feat(onboarding): guided first-login — password, MFA, recovery, confirm role (M-O4)`.
