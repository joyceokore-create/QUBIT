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

## Roles → permissions (canonical — MVP1 Phase 1, 2026-07-17)

The product consolidated to **six canonical tenant roles**; multi-role users are allowed.
Model: **global read, scoped write** — every authenticated user READs all portfolios,
projects, tasks, risks, blockers, milestones and docs in their tenant (RLS still scopes to
the tenant), while WRITE is scoped. `can()` (`src/lib/rbac.ts`) answers only role-level
questions; resource-scoped writes are decided by async helpers in `src/lib/access.ts` that
read membership under RLS and never trust a client-supplied scope (DECISIONS DM1.3).
Permissions are fixed colon-delimited strings; `*` matches anything.

| Role | Meaning | Role-level grants (beyond the global-read base) |
|------|---------|-------------------------------------------------|
| PlatformSuperAdmin | Superadmin | everything (`*`) — admin console, all user management, all writes |
| HeadOfProjects | PMO lead — delivery governance across all projects | admin:access, users:invite, teams:manage:all, project:create, project:write (any), milestone/task/risk/issue/blocker:write, budget:read, report:resource:others |
| HeadOfQA | QA lead — quality governance across all projects | admin:access, users:invite, teams:manage:all, project:create, risk/issue/blocker:write, budget:read, report:resource:others; task:write on Testing/UAT tasks (resource-scoped) |
| Executive | CEO/CTO/execs — read-everything | budget:read, report:resource:others; no admin, no user management, no authoring |
| ProjectManager | Runs the projects they lead / are PM-member of | project:create, milestone/task/risk/issue/blocker:write; project:write + budget:read + report:resource:others are per-project (resource-scoped) |
| Member | Executes assigned work (default) | writes only to tasks assigned to them / risks & blockers they own, plus join requests — all resource-scoped |

**Action gates (PROMPT §2).** `admin:access` = SuperAdmin + both heads. `users:create/
suspend/roles/reset` = SuperAdmin **only**; `users:invite` = SuperAdmin + heads.
`teams:create` = everyone (creator becomes team lead); `teams:manage:own` = team lead;
`teams:manage:all` = SuperAdmin + heads. `project:create` = SuperAdmin + heads + PM.
`budget:read` is hidden from Members. `report:resource:others` = SuperAdmin, Executive,
both heads (any person) + PM (own project members only). `report:portfolio` and
`report:resource:self` = everyone.

### Legacy → canonical mapping

Migration `20260717120000_canonical_roles` remaps existing `role_assignment` grants
(DECISIONS DM1.2):

| Legacy role | Canonical |
|---|---|
| SystemAdmin | PlatformSuperAdmin |
| PlatformSuperAdmin (old cross-tenant, read-only oversight) | Executive |
| PortfolioManager | HeadOfProjects |
| FinanceManager | Executive |
| Contributor | Member |
| Viewer | Member |
| DepartmentHead | Member (dept-head powers now derive from `Department.headUserId` + a Head role) |

The `PlatformSuperAdmin` **name was repurposed** from the former read-only oversight role
to the full-write tenant superadmin. The migration demotes the old grants to `Executive`
*before* promoting `SystemAdmin`, so today's read-only accounts are never silently elevated
to full write.

> **Transitional keys.** Non-admin write routes are still gated on the coarse legacy
> `project:update`; canonical roles are mapped onto it until each route adopts the
> fine-grained keys / `src/lib/access.ts` helpers in its own phase (DECISIONS DM1.4). The
> **admin routes migrated in Phase 4** to `admin:access` + per-action keys + scoped helpers
> (DECISIONS DM1.9). `dashboard:read` is part of the global-read base, so every role lands on
> `/dashboard` after sign-in.

### Editable role permissions (Phase 1.5)

The permission SETS above are **code defaults**. Each role's set is tenant-editable in
Admin → Roles (gated on `roles:manage`, PlatformSuperAdmin-only). Overrides live in the
`role_permission` table (per-tenant, FORCE RLS); a role with no rows uses its code default.
**PlatformSuperAdmin is locked to full access (`*`) and can't be edited** (lockout guard).
Effective permissions are resolved at sign-in and baked into the session, so a change applies
on the affected user's **next login**. See DECISIONS DM1.7. (Assigning a role to a *user* is
separate — Admin → Users → Edit roles.)

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
- Role grants/revocations are performed only by `PlatformSuperAdmin` (the tenant superadmin) and audited.

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
