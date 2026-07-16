# CLAUDE.md — QUBIT ClickUp Transformation (merge into repo root CLAUDE.md)

## Project
QUBIT: multi-tenant work-management platform (transforming from PPM to ClickUp-class). Next.js 15 App Router · Tailwind 4 · shadcn/ui · Prisma/Postgres · NextAuth · pg-boss · SSE realtime. Tenants: KCB (green) and Riverbank (red).

## Read before coding
`docs/clickup-transformation/06-build-plan.md` (current phase) → the phase's sections in `04-module-specs.md` → `03-data-model.md` for touched models. Ambiguity → match ClickUp behavior, log in `DECISIONS.md`.

## Hard rules
1. **Tenant isolation**: all queries via `forTenant()` helpers in `src/server/`. Never call `prisma.*` from route handlers or components. Cross-tenant access returns 404 (not 403).
2. **Permissions**: `can(user, action, resource)` server-side in every handler; UI gating is cosmetic only.
3. **Validation**: Zod schema per endpoint, reject unknown keys; parameterized queries only (Prisma); no `eval` (formula fields use the safe parser in `src/server/fields/formula.ts`).
4. **Colors**: CSS-variable tokens only — no raw hex in components. RAG/status colors are semantic, never per-tenant. All text pairings WCAG AA in both themes.
5. **Migrations**: additive until Phase 8; reversible; update seed with every schema change.
6. **Mutations**: emit `Activity` + realtime `NOTIFY`; automations consume events, never poll.
7. **Secrets** via env; webhooks HMAC-signed; presigned uploads only; never log user content (IDs only).
8. **AI**: server-side only, tenant-scoped retrieval, log to `AiCallLog`, respect token budget.

## Patterns to reuse (do not reinvent)
- SlidePanel + context (`src/components/panels/`) for task panel, portfolio panel, drawers.
- Server data modules `src/server/*.ts`; TanStack Query on client with SSE-driven invalidation.
- Block editor: single TipTap package `src/components/editor/` — docs, descriptions, comments, chat all use it with extension subsets.
- Ordering: fractional `orderIndex` (insert = midpoint).
- Location polymorphism: `(locationType, locationId)` via `resolveLocation()`.
- Inheritance (statuses/fields/permissions/ClickApps): List → Folder → Space via the memoized resolver in `src/server/hierarchy.ts`.

## Testing
Vitest unit (server helpers) + integration (API: happy path, validation, permission, cross-tenant) + component tests for views with fixture pages. Run `npm run test` and `npm run lint` before finishing any task. New endpoint = new permission test.

## Definition of done (per task)
Types clean · tests green · both tenants × both themes verified · Activity emitted on mutations · no raw hex · phase checklist item ticked in `06-build-plan.md` · `CHANGELOG-transformation.md` updated.
