# QUBIT — Documentation Pack for Claude Code

This folder contains everything Claude Code needs to build **QUBIT**, a multitenant
enterprise Portfolio & Programme Management (PPM) web app for **Riverbank Group** and
**KCB Group**.

## How to use this pack

1. Create an empty git repo and drop this `docs/` folder plus the root `CLAUDE.md` into it.
2. Open the repo in Claude Code.
3. Point Claude Code at `docs/00-index.md` first, then work through `docs/10-build-plan.md`
   milestone by milestone. Ask it to implement one milestone at a time.
4. Keep `CLAUDE.md` at the repo root — Claude Code reads it automatically as project memory.

## What's in here

| File | Purpose |
|------|---------|
| `CLAUDE.md` (repo root) | Operating rules Claude Code reads on every session |
| `docs/00-index.md` | Master index + reading order + readiness checklist |
| `docs/01-prd.md` | Product requirements: vision, users, scope, phases |
| `docs/02-architecture.md` | Stack, folder structure, runtime, environments |
| `docs/03-dependencies.md` | Exact dependencies, versions, install commands |
| `docs/04-multitenancy.md` | Tenant model, RLS, tenant resolution, per-tenant theming |
| `docs/05-data-model.md` | Entities, relationships, Prisma schema |
| `docs/06-api-spec.md` | Route handlers / API endpoints and contracts |
| `docs/07-auth-rbac.md` | Authentication, roles, permissions, segregation of duties |
| `docs/08-design-system.md` | Brand tokens, typography, components (per tenant) |
| `docs/09-ui-spec.md` | Screen-by-screen UI spec derived from the dashboard |
| `docs/10-build-plan.md` | Milestone build plan for Claude Code |
| `docs/11-security-compliance.md` | Security controls, data classification, CBK / Kenya DPA |
| `docs/12-testing-qa.md` | Testing strategy and acceptance criteria |
| `docs/13-glossary.md` | Glossary and naming conventions |

## Source materials this pack was derived from

- QUBIT User Guide v1.0 (feature reference)
- QUBIT vs Microsoft Project Comparison v1.0 (capability set, tech direction)
- QUBIT Enterprise PPM Platform walkthrough deck (vision, roadmap, tenancy intent)
- `qubit_exec_dashboard.html` (the interactive design reference — the visual North Star)

## Locked decisions

- **Stack:** Next.js (App Router) + TypeScript + React + Tailwind CSS; PostgreSQL via Prisma; Auth.js (NextAuth v5).
- **Multitenancy:** single shared schema, `tenant_id` on every table, enforced by Postgres Row-Level Security (RLS).
- **Tenants:** Riverbank Group (brand red `#ED1C24`) and KCB Group (brand green `#1B7A3E`), each with sub-organisations / subsidiaries.
- **Build order:** Executive dashboard + core PPM (portfolios → programmes → projects → subsidiaries) + RAID + auth/tenancy first; other modules follow.
