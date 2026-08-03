# 22 — M-O3 Execution Spec: Token Invites + Email + Resend/Reset

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read this file, implement, stop for review)
**Module:** Onboarding & IAM rebuild (docs/20). Depends on M-O1 + M-O2 (in tree).
**Type:** Schema change + mailer enablement + new flow. **Has a Prisma migration.**

---

## 0. Context you must load first

- `src/server/users.ts` — `createUser` currently sets `status:"ACTIVE"`,
  `mustChangePassword:true`, and hashes an admin-supplied temp password. This changes.
- `src/server/mail/mailer.ts` — `getMailer()`, `emailEnabled()` (needs `FEATURE_EMAIL` +
  Graph env), `graphConfigured()`; `send()` never throws. Reuse as-is.
- `src/server/mail/template.ts` — branded HTML template helpers. Add an invite template.
- `src/lib/flags.ts` — `flagEnabled("email")`.
- `src/server/q/shares.ts` — the token pattern to mirror: `randomBytes(32).toString("base64url")`.
  **Difference:** for invites, store a **hash** of the token, never the raw value.
- `src/lib/password.ts` — `validatePasswordPolicy`, `hashPassword`, `isPasswordReused`,
  `pushPasswordHistory`.
- `prisma/schema.prisma` `model User` (line ~132): `status String @default("ACTIVE")`
  (comment lists `ACTIVE|SUSPENDED|DELETED` — add `INVITED`), `mustChangePassword`,
  `previousPasswordHashes`.
- `prisma/rls.sql` — the tenant-table array + `ENABLE`/`FORCE` RLS pattern; **also** note
  `access_request` is deliberately RLS-off (`prisma/rls.sql` top) — the invite-accept
  lookup uses the same justified exemption (see §4.2).
- `docs/04-multitenancy.md` (RLS + DM1.18 migration pattern), `CLAUDE.md` DoD.

## 1. Goal

Replace "admin copies a temp password" with a real, secure invite:

1. Inviting a user creates them as `INVITED` with **no usable password**, mints a
   single-use, expiring token, and **emails a set-password link** (Microsoft Graph).
2. When the mailer isn't configured, the invite returns a **copyable accept link** as a
   fallback (dev/pre-Graph), so the flow works before email is wired on the box.
3. Admins can **Resend invite** (fresh token, old one invalidated) and **Reset password**
   for an active user (same token mechanism).
4. Consuming the token lets the user set their password and activates the account.
   (The full multi-step guided flow — MFA, confirm-role — is M-O4; M-O3 delivers the
   password-set landing the token points at, reusing the existing onboarding form.)

## 2. Data model (Prisma migration)

Add to `prisma/schema.prisma`:

```prisma
model InviteToken {
  id          String    @id @default(uuid())
  tenantId    String    @map("tenant_id")
  userId      String    @map("user_id")
  tokenHash   String    @unique @map("token_hash") // sha256 of the raw token; raw never stored
  purpose     String    @default("invite")         // "invite" | "reset"
  expiresAt   DateTime  @map("expires_at")
  consumedAt  DateTime? @map("consumed_at")
  createdById String    @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation("UserInviteTokens", fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId])
  @@index([userId, consumedAt])
  @@map("invite_token")
}
```

- Add the back-relation to `model User`: `inviteTokens InviteToken[] @relation("UserInviteTokens")`
  and to `model Tenant` the matching `inviteTokens InviteToken[]`.
- `User.status`: no enum change (it's a `String`); start writing `"INVITED"`. Update the
  inline comment to `ACTIVE | INVITED | SUSPENDED | DELETED`.
- **RLS:** add `invite_token` to the tenant-table array in `prisma/rls.sql` (ENABLE +
  FORCE, `USING`/`WITH CHECK` on `tenant_id = current_setting('app.tenant_id')`), AND add
  the policy in the same migration SQL (DM1.18 pattern — don't rely on `rls.sql` alone;
  M-O1 is separately fixing that drift). Admin paths (mint/resend/list) run under RLS.
- Migration name: `mN_invite_tokens`. Run `pnpm prisma migrate dev`. It applies at
  container start in prod (per `CLAUDE.md`), so no extra deploy step.

## 3. Token helper — `src/lib/invite-token.ts` (new)

```ts
import { randomBytes, createHash } from "node:crypto";

const TTL_HOURS = 72;

export function newInviteToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("base64url");        // 256-bit, unguessable
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash, expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000) };
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
```

Rationale: store only the hash (a leaked DB row can't be replayed); 256-bit entropy makes
the `token_hash` lookup enumeration-safe.

## 4. Server layer — `src/server/users.ts` and `src/server/invites.ts` (new)

### 4.1 Change `createUser`

- Remove the admin-supplied `password` requirement. Create the user with
  `status:"INVITED"`, `passwordHash:null`, `mustChangePassword:true`.
- Keep all existing placement/roles/groups logic and the M-O1 `assertMayGrantSuperAdmin`
  guard.
- After creating the user (same transaction or a follow-up), mint an invite token and send
  the email; return `{ user, acceptUrl }` where `acceptUrl` is included **only when
  `!emailEnabled()`** (fallback). Update `CreateUserInput` to drop `password` (and the
  route/UI stop sending it).

### 4.2 New `src/server/invites.ts`

```ts
// mintInvite(ctx, userId, purpose): mint token (withTenant), audit "invite_sent",
//   build acceptUrl = `${APP_URL}/onboarding/accept?token=${raw}`, send via getMailer()
//   using the invite template; return { acceptUrl, emailed: boolean }.
// resendInvite(ctx, userId): invalidate prior unconsumed tokens for that user
//   (set consumedAt = now or delete), then mintInvite(..., "invite"). Audited.
// startPasswordReset(ctx, userId): mintInvite(..., "reset") for an ACTIVE user. Audited.
// consumeInviteToken(rawToken, newPassword): the UNAUTHENTICATED accept path.
```

`consumeInviteToken` details (security-critical):
- Look up by `hashInviteToken(rawToken)` with a **direct, RLS-exempt** read
  (`prisma.inviteToken.findUnique({ where: { tokenHash } })`) — justified exactly like
  `access_request`: the request carries no session, and the 256-bit token IS the
  capability. Select `tenantId, userId, expiresAt, consumedAt, purpose`.
- Reject if missing, `consumedAt != null`, or `expiresAt < now` → throw a typed error the
  route maps to 400 with a generic "This link is invalid or has expired."
- Validate the new password (`validatePasswordPolicy`, `isPasswordReused` vs the user's
  history). Then, **inside `withTenant({ tenantId, userId })`**: set `passwordHash`, push
  history, `status:"ACTIVE"`, `mustChangePassword:false` (for M-O3; M-O4 will defer this
  flag to the end of the guided flow), stamp `consumedAt` on the token, and `audit("invite_accepted")`.
- Return the tenant slug so the accept page can theme + link to `/login`.

Add `APP_URL` (public base URL, e.g. `https://q.fikrawork.com`) to env usage; reuse
`AUTH_URL` if already set on the box (see `CLAUDE.md` env gotchas) rather than adding a new var.

## 5. Email template — `src/server/mail/template.ts`

Add `inviteEmail({ name, tenantName, acceptUrl, brandColor })` returning `{ subject, html, text }`,
using the existing branded wrapper. Subject e.g. `"You're invited to QUBIT"`. Body: greeting,
one CTA button to `acceptUrl`, a plain-text URL fallback, and "link expires in 72 hours".
Never include a password.

## 6. Routes

- `src/app/onboarding/accept/page.tsx` (new, **public**, outside `(app)`): reads `?token`,
  renders a set-password form (reuse the existing `onboarding-form` fields/validation, but
  it POSTs to the accept endpoint with the token, not the authenticated complete route).
  On success → link to `/login`. Invalid/expired token → friendly message.
- `src/app/api/onboarding/accept/route.ts` (new, **public**, add to `middleware.ts` matcher
  exclusions like the other unauthenticated routes if needed): `POST { token, password }`
  → `consumeInviteToken`. Rate-limit per IP (reuse `src/lib/rate-limit.ts` pattern from
  `api/access-request`).
- `src/app/api/admin/users/[id]/resend/route.ts` (new): `POST`, gate `users:invite` →
  `resendInvite`. Returns `{ emailed, acceptUrl? }`.
- `src/app/api/admin/users/[id]/reset-password/route.ts` (new): `POST`, gate `users:reset`
  → `startPasswordReset`. Returns `{ emailed, acceptUrl? }`. Add `users:reset` to
  `PERMISSION_CATALOGUE` and grant it to `PlatformSuperAdmin` (via `*`) — heads keep
  `users:invite` only. (This is the one small, additive permission addition; keep the model.)

## 7. UI (adopt M-O2 shared foundation — `useAdminMutation`, `AdminFormDialog`)

- `new-user-dialog.tsx`: drop the temp-password field + `generatePassword`. Final step
  submits the invite; the "done" phase shows **"Invite emailed to <email>"** when
  `emailed`, or the **copyable accept link** when the response includes `acceptUrl`
  (mailer off). Keep the role-tier gating from M-O2.
- `user-row-actions.tsx`: add **"Resend invite"** (visible when `user.status === "INVITED"`
  or never-signed-in) and **"Reset password"** (active users; gated on `canManage`/reset).
  Both POST via `useAdminMutation`; surface the emailed/copy-link result in a small dialog.
- `users-client.tsx`: the directory already shows an "invited / never signed in" segment;
  make the status pill show `INVITED` distinctly.

## 8. Enable email on the box (ops note, not code)

Set on the deployment box `.env.production`: `FEATURE_EMAIL=1`, `GRAPH_TENANT_ID`,
`GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER`. Until then, `emailEnabled()` is
false and the copy-link fallback carries the flow (§4.1/§7). Do not hardcode any of these.

## 9. Acceptance criteria

- Inviting a user creates them `INVITED` with `passwordHash = null`; no temp password is
  ever generated or displayed.
- With `FEATURE_EMAIL` off: invite returns a copyable `acceptUrl`; opening it, setting a
  valid password, activates the account (`status ACTIVE`, `mustChangePassword false`) and
  the token is single-use (second use → 400).
- Expired (>72h) or already-consumed token → generic 400, no account change.
- Resend invalidates the previous token; reset works for an active user.
- Cross-tenant: an invite token for tenant A cannot activate a user in tenant B
  (RLS + the tenantId carried on the token) — assert in an RLS test.
- Every mutation writes an audit row (`invite_sent`, `invite_accepted`, `password_reset`).
- No secrets/PII in logs; the raw token appears only in the email/return value, never in DB
  or audit `after`.

## 10. Tests (write these)

- `tests/rls/invite-tokens.test.ts`: mint → consume happy path; expiry; single-use;
  wrong-hash miss; cross-tenant isolation; audit rows present.
- `tests/unit/invite-token.test.ts`: `newInviteToken` entropy/format, `hashInviteToken`
  determinism, TTL math.
- Extend `tests/rls/onboarding.test.ts`: a freshly invited user is `INVITED` with null hash.

## 11. Verify

```bash
pnpm prisma migrate dev        # creates mN_invite_tokens
pnpm prisma generate
pnpm typecheck && pnpm lint
pnpm test -- invite onboarding
```

Commit: `feat(iam): token-based email invites + resend/reset (M-O3)`.
