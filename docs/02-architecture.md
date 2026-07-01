# 02 — Architecture

## Overview

QUBIT is a single Next.js (App Router) application. Server Components and Route Handlers talk
to PostgreSQL through Prisma. Every request resolves a **tenant context** and runs database
work under Postgres Row-Level Security so tenant isolation is enforced by the database, not
just application code.

```
Browser (React 19, Tailwind, shadcn/ui)
        │  HTTPS
        ▼
Next.js App Router  ──►  Route Handlers / Server Actions
        │                        │
        │                 Tenant + Auth middleware
        │                        │
        ▼                        ▼
   Server Components        Prisma Client  ──►  PostgreSQL 17
                                 │                  (RLS policies on tenant_id)
                          set app.tenant_id per request
```

## Why this stack

- **Next.js + React + TypeScript** — fastest path for a dashboard-heavy SPA; Server Components
  keep data access on the server; one codebase for UI + API.
- **PostgreSQL + Prisma** — typed data access, migrations, and native RLS for tenant isolation.
- **Auth.js (NextAuth v5)** — sessions, credentials + optional SSO, MFA hooks.
- **Tailwind + shadcn/ui** — reproduces the uploaded design quickly with themeable tokens.

## Runtime request flow (tenant + auth)

1. `middleware.ts` reads the session (Auth.js). Unauthenticated → redirect to `/login`.
2. The session carries `tenantId`, `userId`, roles. Middleware attaches `tenantId` to a
   request header / context.
3. Server code opens a Prisma transaction and runs
   `SET LOCAL app.tenant_id = '<tenantId>'` (and `app.user_id`) so RLS policies apply.
4. All queries in that transaction are automatically tenant-scoped by RLS.
5. Mutations also write an `audit_log` row.

See `04-multitenancy.md` for the exact helper (`withTenant()`).

## Folder structure

```
qubit/
├─ CLAUDE.md
├─ docs/                        # this pack
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  ├─ rls.sql                   # RLS policies (applied via migration)
│  └─ seed.ts                   # synthetic tenants + demo data
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/          # auth pages
│  │  ├─ (app)/                 # authenticated shell (topbar + sidebar)
│  │  │  ├─ layout.tsx          # tenant theming applied here
│  │  │  ├─ dashboard/          # exec dashboard (group overview)
│  │  │  ├─ portfolios/[id]/    # portfolio detail → programmes → projects
│  │  │  ├─ standalone/         # independent items
│  │  │  ├─ subsidiaries/[id]/  # subsidiary filter view
│  │  │  ├─ risks/              # RAID
│  │  │  ├─ tasks/              # (Phase B)
│  │  │  └─ ...
│  │  ├─ api/                   # route handlers (see 06-api-spec.md)
│  │  └─ layout.tsx             # root layout, fonts
│  ├─ components/
│  │  ├─ ui/                    # shadcn primitives
│  │  ├─ dashboard/             # KpiStrip, HealthHeatmap, PortfolioCard, ...
│  │  ├─ panels/                # SlidePanel, ProjectPanel
│  │  └─ layout/                # Topbar, Sidebar, TenantChip
│  ├─ lib/
│  │  ├─ db.ts                  # Prisma client
│  │  ├─ tenant.ts              # withTenant(), getTenantContext()
│  │  ├─ auth.ts                # Auth.js config
│  │  ├─ rbac.ts                # permission checks
│  │  ├─ audit.ts               # audit helper
│  │  └─ theme.ts               # tenant → brand tokens
│  ├─ server/                   # domain services (queries/mutations by module)
│  │  ├─ portfolios.ts
│  │  ├─ projects.ts
│  │  ├─ risks.ts
│  │  └─ ...
│  ├─ styles/globals.css        # Tailwind + CSS variables (brand tokens)
│  └─ types/
├─ tests/
│  ├─ unit/
│  ├─ e2e/                      # Playwright
│  └─ rls/                      # cross-tenant isolation tests
├─ .env.example
├─ package.json
└─ tsconfig.json
```

## Environments

| Env | DB | Notes |
|-----|----|-------|
| Local dev | Local Postgres 17 (Docker) | `pnpm dev`; seeded synthetic data |
| CI | Ephemeral Postgres | lint + typecheck + unit + RLS tests |
| Staging | Hosted Postgres | full e2e; real tenant config |
| Production | Hosted / on-prem Postgres | RLS enforced; secrets from vault |

## Configuration (`.env.example`)

```
DATABASE_URL="postgresql://qubit:qubit@localhost:5432/qubit?schema=public"
AUTH_SECRET="generate-with: openssl rand -base64 32"
AUTH_URL="http://localhost:3000"
# Optional SSO (Phase D)
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID=""
```

Secrets are never committed. In production, inject via the platform's secret manager.

## Deployment notes

- App is stateless; scale horizontally behind a load balancer.
- Database connection pooling (e.g. PgBouncer / platform pooler) for serverless runtimes.
- Because RLS lives in the DB, isolation holds regardless of how many app instances run.
- Cloud-agnostic: deploy to Vercel, Azure, AWS or on-prem containers (see `00-index.md`).
