## What & why

<!-- One or two sentences. Link the issue / docs milestone this implements (e.g. docs/35 M-P4a). -->

## Definition of Done — non-negotiables

<!-- Delete lines that genuinely don't apply (e.g. docs-only PRs), tick the rest. -->

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally against a migrated, seeded DB
- [ ] New tables: `tenant_id` column + registered in **both** the migration **and** `prisma/rls.sql`, with an RLS isolation test
- [ ] New/changed mutations write `audit_log` rows (before/after snapshots)
- [ ] No secrets and no real/realistic PII in code, seeds, fixtures, or tests
- [ ] Input validated with Zod; tenant-owned data accessed via `forTenant()`, never bare `prisma.*`
- [ ] Docs updated where behaviour changed (`docs/`, `DECISIONS.md`)

## Deployment note

- [ ] **This PR contains a Prisma migration** → deploy needs the full `./scripts/deploy.sh` (a `--no-build` deploy cannot deliver it)
