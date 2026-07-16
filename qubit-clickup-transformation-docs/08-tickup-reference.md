# 08 — Reference: techmely/tickup

`https://github.com/techmely/tickup` was evaluated as a starting point and **rejected as a base** (Dec 2023, abandoned tutorial scaffold: core modules are `.gitkeep` placeholders; stack conflicts — Clerk, PlanetScale MySQL/Kysely, Next 14, Valibot). QUBIT remains the base. Use tickup only as a **reference**, never copy code from it.

## What to borrow

1. **Module-first layout (Clean Architecture / DDD flavor).** tickup organizes by domain module (`modules/task`, `modules/space`, `modules/field`, …) rather than by technical layer. Adopt the spirit inside QUBIT's existing conventions: keep each domain's server logic cohesive in `src/server/<domain>.ts` (or a folder when it grows: `src/server/automations/`), with its Zod schemas and tests beside it. Do **not** adopt tickup's controller/use-case/repository ceremony or `inversify` DI — QUBIT's server-module pattern is simpler and sufficient.

2. **Module checklist as a completeness cross-check.** tickup's intended module list (hierarchy, space, folder, task, field, document, whiteboard, ai, team, user, onboarding, preferences) is covered by `04-module-specs.md` §1–17. Two items worth noting for the backlog, not v1: onboarding flow (guided first-run: create space → list → invite) and per-user preferences page (theme, notification prefs — partially in §8).

3. **Testing ambitions.** tickup wired Playwright + Cucumber (BDD) and architecture tests (`tsarch`). We keep Vitest + integration tests per `CLAUDE.md`; consider Playwright smoke flows at Phase 8 (create task → move board card → comment → automation fires).

## What NOT to take

- Clerk auth (QUBIT uses NextAuth + tenant resolution), PlanetScale/Kysely (Prisma/Postgres), Valibot (Zod), pinned pre-release React, `million.js`, `inversify`, Vercel KV/Upstash (pg-boss + Postgres cover it).
- Any UI: its dashboard is an empty shell; QUBIT's design system is the authority.
