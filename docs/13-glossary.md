# 13 — Glossary & Conventions

## Domain terms

| Term | Meaning |
|------|---------|
| Tenant | Top-level isolated organisation (KCB Group, Riverbank Group) |
| Sub-organisation / Subsidiary | Division within a tenant (e.g. KCB Kenya); modelled as `org_unit` |
| Portfolio | Group of programmes/projects under an owner |
| Programme | Multi-project initiative between portfolio and project |
| Project | Delivery item; may be standalone or inside a programme |
| ProjectOrgStatus | A project's progress/status/milestones **for one subsidiary** |
| Milestone | Named stage of a project (per subsidiary) with a state |
| RAID | Risks, Issues, Change requests (governance items) |
| Risk | Something that might happen; has owner, probability, impact, mitigation |
| Issue | A materialised problem; may link back to its origin risk |
| Change Request | Formal change to scope/schedule/budget/quality |
| RAG | Red/Amber/Green status (Overdue/At Risk/On Track) |
| PIR | Post-Implementation Review |
| GTM | Go-to-market |
| RLS | Row-Level Security (Postgres tenant isolation) |
| RBAC | Role-Based Access Control |
| SoD | Segregation of Duties |
| Audit log | Immutable record of mutations (actor, entity, before/after) |
| LUMI | QUBIT's AI engine (later phase) |

## Status vocabulary

`Planning · OnTrack · AtRisk · Overdue · Completed · Cancelled`
Milestone states: `pending · active · done · late`.

## Naming conventions

- Files: kebab-case (`health-heatmap.tsx`). Components: PascalCase (`HealthHeatmap`).
- Functions/vars: camelCase. Types/enums: PascalCase. DB tables/columns: snake_case.
- Route handlers under `src/app/api/**/route.ts`. Domain logic under `src/server/*`.
- Env vars: SCREAMING_SNAKE_CASE; names only in `.env.example`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).

## Colour semantics (do not confuse with brand)

- Brand accent = per tenant (`--brand`): KCB green, Riverbank red.
- Status colours = fixed semantics: On Track green, At Risk amber, Overdue red, Planning blue.

## IDs & formats

- Primary keys: UUID v4. Human codes: `P001` (project), `PROG1`, `INIT-003` where shown.
- Dates: ISO-8601 in the API; formatted for display with `date-fns` (e.g. "Jun 20, 2026").
- Money: display strings in Phase A; integer minor units + currency from Phase C.
