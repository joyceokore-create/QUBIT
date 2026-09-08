# Contributing to QUBIT

This is the team's working agreement for collaborative development. It codifies what
[`CLAUDE.md`](./CLAUDE.md) and [`docs/`](./docs/00-index.md) already prescribe — read those
first; when in doubt, they win.

## Workflow at a glance

1. Branch off `Development`, do one milestone/change per branch, open a PR **targeting `Development`**.
2. CI (`gates`) must be green and one teammate must approve.
3. Squash-merge with a Conventional-Commits PR title. The branch auto-deletes.
4. To release: open a `Development` → `main` PR. Deploy only from green `main`, via `./scripts/deploy.sh`.

Nobody pushes directly to `main` or `Development` — including repo admins.

## Branches

- `main` — what runs in production. Only receives `Development` → `main` release PRs.
- `Development` — the integration branch all feature PRs target.
- Branch from up-to-date `Development`: `git switch Development && git pull && git switch -c <type>/<short-name>`
- Types mirror commit types: `feat/…`, `fix/…`, `docs/…`, `ci/…`, `refactor/…`, `chore/…`, `test/…`
- Keep branches short-lived (days, not weeks). One milestone or one coherent change per PR —
  the same scope discipline as `docs/10-build-plan.md`'s "one milestone at a time".

## Commits and PR titles

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, etc.
- We squash-merge, so **the PR title becomes the commit on `main`** — write it as a
  conventional commit message. Individual commits on the branch can be messy; the title can't.

## Before you push

Run the same gates CI runs (needs a migrated, seeded local Postgres 17 — see
[README → Getting started](./README.md#getting-started)):

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Review

- Every PR needs **one approval** from someone who is not the author.
- Reviewers check the PR-template checklist, not just the diff — the non-negotiables
  (tenancy, audit, no PII) are cheap to verify at review time and expensive to fix after.
- Never merge on red CI. If `gates` fails for an unrelated reason, fix or flag it first —
  a broken gate that gets bypassed once stops being a gate.

## The non-negotiables (from CLAUDE.md)

Every PR must hold these; the PR template asks about each:

- **Tenancy**: every new table carries `tenant_id` and is registered in **both** its Prisma
  migration **and** [`prisma/rls.sql`](./prisma/rls.sql). RLS tests must cover it.
- **Audit**: every new mutation writes an `audit_log` row (use the existing `audit()` helper).
- **No secrets, no real PII** in code, seeds, fixtures, or tests — synthetic placeholders only.
- **Validation**: all input through Zod; DB access through Prisma under the tenant context
  (`forTenant()` — never bare `prisma.*` for tenant-owned data).

## Migrations and deployment

- Deploys go out with `./scripts/deploy.sh` from a green `main` only.
- **A PR that adds a Prisma migration requires a full-rebuild deploy** — `--no-build` cannot
  deliver new migrations (the entrypoint runs them from files baked into the image). Say so
  in the PR (the template has a checkbox) so whoever deploys knows.
- After a data migration, verify row counts on the box **under the tenant's RLS context** —
  a bare `count(*)` on a FORCE-RLS table reads 0 and looks like success.

## Tracking work

- Day-to-day dev work: GitHub Issues on this repo.
- The product backlog and milestone plans stay in `docs/` (see
  [`docs/36-pending-checklist.md`](./docs/36-pending-checklist.md)); record notable decisions
  in [`DECISIONS.md`](./DECISIONS.md) as before.
