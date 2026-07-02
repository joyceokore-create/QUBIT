# 04 — Multitenancy & Row-Level Security

**Model:** single database, single shared schema, a `tenant_id` column on every tenant-owned
table, isolation enforced by PostgreSQL Row-Level Security (RLS). This is the cheapest to
operate for two tenants with sub-organisations and gives database-guaranteed isolation.

## Concepts

- **Tenant** — a top-level isolated organisation. Launch tenants: `KCB Group`, `Riverbank Group`.
- **Sub-organisation / subsidiary** — a division within a tenant (e.g. KCB Kenya). Modelled as
  an `org_unit` row with `tenant_id`; NOT a separate tenant.
- **User** — belongs to exactly one tenant (except platform super-admins).
- **Tenant context** — the current `tenant_id` for a request, derived from the session.

## Rules

1. Every tenant-owned table has `tenant_id uuid NOT NULL REFERENCES tenant(id)`.
2. RLS is enabled and forced on every such table.
3. The app sets `app.tenant_id` (and `app.user_id`) per transaction; RLS policies read it.
4. Application code must always go through `withTenant()` — never a bare Prisma call for
   tenant data.
5. Cross-tenant reads are impossible for normal users. Platform super-admins use an explicit,
   audited "act as tenant" switch that sets the context deliberately.

## RLS policy (prisma/rls.sql — applied via migration)

```sql
-- Example for the "project" table; replicate for every tenant-owned table.
ALTER TABLE project ENABLE ROW LEVEL SECURITY;
ALTER TABLE project FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_project ON project
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- `USING` filters rows on read/update/delete.
- `WITH CHECK` prevents inserting/updating a row into another tenant.
- `current_setting('app.tenant_id', true)` returns NULL if unset → policy denies (no rows),
  which is the safe default.
- The application DB role must be a non-superuser and NOT `BYPASSRLS`.

Apply the same pattern to: `org_unit`, `portfolio`, `programme`, `project`,
`project_org_status`, `milestone`, `task`, `risk`, `issue`, `change_request`, `comment`,
`document`, `decision`, `notification`, `audit_log`, `user`, `role_assignment`,
`department`, etc.

## The `withTenant()` helper (src/lib/tenant.ts)

```ts
import { prisma } from "@/lib/db";

export async function withTenant<T>(
  ctx: { tenantId: string; userId: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // set_config(key, value, is_local=true) → scoped to this transaction
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}
```

Usage in a server module:

```ts
export function listPortfolios(ctx: TenantContext) {
  return withTenant(ctx, (tx) => tx.portfolio.findMany({ orderBy: { name: "asc" } }));
}
```

Because RLS is active, `findMany` returns only the current tenant's rows — no `where tenantId`
needed (but still set `tenant_id` on inserts).

## Getting the tenant context

`getTenantContext()` reads the Auth.js session (server-side) and returns `{ tenantId, userId,
roles }`. It throws if there is no session. Route handlers and server actions call it first.

## Per-tenant theming

Theming is a presentation concern layered on top of isolation. The tenant record carries brand
tokens; the authenticated layout applies them as CSS variables. See `08-design-system.md`.

| Tenant | `--brand` | `--brand-light` | Display name |
|--------|-----------|-----------------|--------------|
| KCB Group | `#1B7A3E` | `#E8F5EE` | KCB Group |
| Riverbank Group | `#ED1C24` | `#FDECEC` | Riverbank Group |

## Tenant switching (super-admin only)

- Only `PLATFORM_SUPER_ADMIN` sees the tenant switcher as active.
- Switching writes an `audit_log` entry (`actor`, `from_tenant`, `to_tenant`, `timestamp`).
- The switch changes the session's active `tenantId`; all subsequent queries re-scope via RLS.

## Testing isolation (mandatory)

`tests/rls/` must include: seed tenant A and tenant B; authenticate as an A user; assert that
every list/detail endpoint returns only A data and that attempting to read a known B id returns
404/empty. This test gates every milestone.
