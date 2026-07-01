# 07 — Auth, RBAC & Audit

## Authentication (Auth.js / NextAuth v5)

- Credentials provider for Phase A (email + password, bcrypt/argon2 hash). No organization
  selector: `User.email` is only unique per-tenant, and RLS forces the tenant to be known
  before any `user` row can be read, so which tenant a login belongs to has to come from
  somewhere. QUBIT resolves it from the email's domain — `Tenant.domains` lists the
  domain(s) registered to each tenant, and `src/lib/tenant-domain.ts` looks up the domain
  from the submitted email before the user lookup runs. The login form calls
  `/api/auth/resolve-org` as the user types to show which organization it resolved to
  before they submit. This wasn't specified here originally; it's the resolution to that
  gap.
- Azure AD / OIDC SSO provider added in Phase D.
- Session strategy: database sessions via `@auth/prisma-adapter`, or JWT with short expiry
  (mirror QUBIT's 24-hour token expiry). Re-auth on expiry.
- The session includes `userId`, `tenantId`, `roles`, and `brand` tokens for theming.
- **MFA (TOTP):** enrol via `otplib` + `qrcode`; store the secret encrypted; require the
  6-digit code after password on subsequent logins.
- Login endpoint is rate-limited; lock out after repeated failures.
- Password policy: min 8 chars, cannot reuse last 3.

```ts
// src/lib/auth.ts (shape)
callbacks: {
  async jwt({ token, user }) { if (user) { token.tenantId = user.tenantId; token.roles = user.roles; } return token; },
  async session({ session, token }) {
    session.user.tenantId = token.tenantId;
    session.user.roles = token.roles;
    return session;
  }
}
```

## Roles → permissions

Roles bundle permission keys. Permissions are fixed strings checked in `rbac.ts`.

| Role | Key permissions (Phase A subset) |
|------|----------------------------------|
| SystemAdmin | all within tenant; `iam:manage`; can bypass approvals (audited) |
| PortfolioManager | `dashboard:read`, `portfolio:*`, `project:read`, `risk:read`, reports:read |
| ProjectManager | `project:*`, `risk:*`, `issue:*`, `task:*` (own projects) |
| FinanceManager | finance:* (Phase C) |
| Contributor | `task:*` (assigned), `risk:create`, `issue:create`, `timesheet:submit` |
| Viewer | `*:read` only |
| DepartmentHead | dynamic approval role (resource allocation approvals) |
| PlatformSuperAdmin | `tenant:switch`, cross-tenant admin ONLY; no business-data authoring |

### Permission check

```ts
export function can(ctx: TenantContext, permission: string, scope?: Scope): boolean { … }

// in a route handler:
if (!can(ctx, "project:create")) return forbidden();
```

`can()` resolves the user's role assignments (with optional portfolio/orgUnit scope) and
matches against the permission, honouring wildcards (`project:*`).

## Segregation of Duties (SoD)

- The submitter of an approvable item cannot approve it (enforce in the approval engine, Phase C).
- Role grants/revocations are performed only by `SystemAdmin`/`PlatformSuperAdmin` and audited.

## Navigation adapts to permissions

Sidebar/topbar items render only if the user holds the required permission — mirror QUBIT's
behaviour (a Contributor never sees Finance/IAM). Do the check server-side; don't rely on
hiding in the client alone.

## Audit (src/lib/audit.ts)

Every create/update/delete on a tracked entity writes an `audit_log` row inside the same
`withTenant()` transaction as the mutation:

```ts
await audit(tx, {
  actorId: ctx.userId, action: "update",
  entityType: "project", entityId: id,
  before, after,
});
```

- Tenant-scoped (RLS applies to `audit_log` too).
- Decisions and approved change requests are immutable once recorded.
- Tenant switches by super-admins are audited with `from`/`to` tenant.

## Security cross-references

Rate limiting, secret handling, encryption and PII rules live in `11-security-compliance.md`.
Never trust client-supplied `tenantId`, role, or permission — always derive from the session.
