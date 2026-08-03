# CLAUDE.md — QUBIT project memory

You are building **QUBIT**, a multitenant enterprise PPM (Portfolio & Programme
Management) web application for **Riverbank Group** — the only real tenant since M10
(DM1.46). A synthetic **Demo Org B** tenant exists in the dev seed purely so RLS
isolation tests always have a tenant B; it is never a customer. Read
`docs/00-index.md` before starting, and follow `docs/10-build-plan.md` milestone by
milestone. Implement ONE milestone at a time and stop for review.

## Non-negotiable rules

1. **Multitenancy is mandatory on every data path.** Every table has a `tenant_id`.
   Every query runs under the current tenant's Postgres RLS context. Never write a query
   that can read or write across tenants. See `docs/04-multitenancy.md`.
2. **Security by design.** Parameterised queries only (Prisma). Validate all input with
   Zod. Secrets come from environment variables — never hardcode credentials, tokens or
   connection strings. Never commit `.env`. See `docs/11-security-compliance.md`.
3. **No real or realistic PII in code, seeds, tests or fixtures.** Use clearly synthetic
   placeholders (`user_001`, `test@example.invalid`). Never put customer PII, payment or
   health data in the app's free-text fields or seed data.
4. **Type-safe end to end.** TypeScript `strict` mode. No `any` without a written reason.
5. **Follow the design system exactly.** Brand tokens, spacing and components come from
   `docs/08-design-system.md`. Theming is per-tenant data (Riverbank = red #ED1C24); the
   product default green covers pre-auth and any non-Riverbank tenant.
6. **Every mutation is audited.** Writes to tracked entities create an `audit_log` row
   (actor, tenant, entity, before/after). See `docs/07-auth-rbac.md`.

## Tech stack (do not substitute without asking)

- Next.js 15 (App Router, Server Components, Route Handlers) + React 19 + TypeScript 5.
- Tailwind CSS 4 for styling; shadcn/ui + Radix primitives for components; lucide-react icons.
- PostgreSQL 17 + Prisma ORM. Row-Level Security enforced in the database.
- Auth.js (NextAuth v5) for authentication; JWT/session; TOTP MFA.
- Zod for validation; TanStack Query for client data fetching; Recharts for charts.
- Vitest + React Testing Library + Playwright for tests.

## Conventions

- Package manager: `pnpm`. Node 20 LTS+.
- Directory layout and naming: see `docs/02-architecture.md`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`…). Small, reviewable PRs per milestone.
- Server-only secrets and DB access never reach client components. Mark server files clearly.
- Files: kebab-case for files, PascalCase for components, camelCase for functions/vars.
- Do not introduce a new dependency that isn't in `docs/03-dependencies.md` without noting why.

## Common commands

```bash
pnpm install                 # install deps
pnpm dev                     # run dev server
pnpm prisma migrate dev      # apply schema changes
pnpm prisma db seed          # seed synthetic tenants/data
pnpm test                    # unit tests (Vitest)
pnpm test:e2e                # Playwright e2e
pnpm lint && pnpm typecheck  # quality gates (must pass before a milestone is "done")
```

## Deployment

QUBIT runs as a Docker Compose stack (app + Postgres 17) on the box
`osbui@192.168.2.43`, under `/home/osbui/applications/qubit`, published on host port
**3001**. Public URL: **https://q.fikrawork.com** (team-run openresty reverse proxy →
box:3001, TLS terminated at the proxy).

**Push changes with one command** (from this repo, over SSH key `~/.ssh/id_ed25519`):

```bash
./scripts/deploy.sh            # rsync → docker compose up -d --build → verify
./scripts/deploy.sh --no-build # sync + restart only (no image rebuild)
./scripts/deploy.sh --logs     # deploy then tail app logs
```

The script never ships `node_modules`, `.next`, `.git`, or `.env*` — production secrets
live only in `.env.production` / `.env` **on the box** and are left untouched. Prisma
migrations run automatically at container startup, so schema changes deploy with no
extra step.

**Env / config gotchas:**
- `--no-build` CANNOT deliver new Prisma migrations: the entrypoint runs them from the
  files baked into the image, not from the synced tree. Any deploy that adds a migration
  needs the full `./scripts/deploy.sh` (rebuild). Always verify data migrations by row
  count on the box afterwards — under each tenant's RLS context (a bare `count(*)` on a
  FORCE-RLS table reads 0 and looks like success).
- `.env.production` on the box holds runtime secrets. `AUTH_URL` MUST be the public URL
  (`https://q.fikrawork.com`) with `AUTH_TRUST_HOST=true`, or NextAuth emits broken
  internal-IP callback URLs.
- Build toolchain is pinned: `packageManager: pnpm@9.15.9` (lockfile is v9.0; pnpm 10/11
  break on the build-script approval gate) and the Docker image uses Node 22. `.npmrc`
  sets `node-linker=hoisted` so Prisma's generated client resolves for the Docker build.
- LAN access from a `192.168.1.x` Mac needs the `192.168.2.50` alias/route (see
  `~/qubit-alias-setup/`); the public URL works regardless of the Mac's alias.

## Definition of done (per milestone)

- Feature works for Riverbank with correct theming (and breaks nothing under the
  synthetic Demo Org B fixture tenant).
- RLS verified: a user in tenant A cannot see tenant B data (there is a test for this).
- `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass.
- New mutations write audit rows.
- No secrets or PII committed.
