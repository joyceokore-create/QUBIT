# 28 — P1-B Execution Spec: Project Creation Wizard

**Status:** Ready to execute · 2026-08-03
**For:** Claude Code (read, implement, stop for review)
**Phase:** P1. Pairs with wireframe `qubit-wizards-wireframes.html` (Project). Depends on
P1-A (portfolio/programme + wizard chrome) and P1-C for the Team step (assignment).
**Type:** Extend `createProject` + new multi-step wizard UI. Small schema add.

## 0. Load first
- `src/server/projects.ts`: `createProject` (line 437), `CreateProjectInput`,
  `projectCodeBase`/`nextFreeCode` (auto code), `unassignedPortfolioId` (portfolio
  required, self-heals). Project already has `portfolioId`, `programmeId`,
  `checkpointTemplateId`, `pipelineStage` (default "Exploring"), `leadUserId`, `startDate`.
- `CheckpointTemplate` (unique `[tenantId,name]`) — seed "Product build" / "Market rollout"
  exist per `docs/18 §2`.
- YouTrack integration: `src/server/integrations.ts` + `src/components/workspace/integrations-grid.tsx`
  (connect base URL + project + field map; `FEATURE_YOUTRACK`).
- Q ingest: `src/server/q/draft-brd.ts` (BRD → candidate requirements, human-gated).
- Requirements/documents servers: `src/server/{requirements,documents}.ts`.

## 1. Goal
Replace the single New-Project form with a guided wizard that produces a fully set-up
project — placed, typed, market-scoped, staffed, optionally BRD-ingested, and
YouTrack-linked — in one session, with draft-save.

## 2. Schema
Mostly reuse. Add only if not present:
```prisma
// model Project
orgUnitCodes  String[] @default([]) @map("org_unit_codes") // OPTIONAL convenience mirror of chosen markets
```
Prefer creating `ProjectOrgStatus` rows (existing market-track model) over a raw array;
only add the array if the wizard needs a cheap prefill. Otherwise **no schema change** —
markets become `ProjectOrgStatus` rows, team becomes `ProjectMember` rows (P1-C).

## 3. Server — extend `CreateProjectInput` + `createProject`
Add optional inputs, all validated, all backward-compatible:
```ts
checkpointTemplateId: z.string().optional(),        // sets the Delivery tab's gates
pipelineStage: z.enum(["Exploring","Evaluating","Approved"]).default("Exploring"),
markets: z.array(z.string()).default([]),           // OrgUnit.code[] (Market) → ProjectOrgStatus rows
members: z.array(z.object({                          // handed to the P1-C assignment helper
  userId: z.string().uuid(), role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(0).max(100).nullable().optional(),
  startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(),
})).default([]),
youtrack: z.object({ baseUrl: z.string().url(), project: z.string() }).optional(),
```
In `createProject` (same transaction): create the project (existing), then seed
`ProjectOrgStatus` for each market, call the P1-C `assignMembers` helper for `members`
(runs capacity/leave checks — see docs/29), and if `youtrack` present + flag on, persist the
integration (encrypted, via `integrations.ts`). BRD ingest is **not** run in the mutation —
the wizard's Docs step calls `draft-brd` separately and only approved items are applied.
Keep the P2002 code-race retry. Audit the create with the chosen template/stage/markets.

## 4. Routes
- Reuse `POST /api/projects` (gate `project:create`); accept the extended body.
- `POST /api/projects/[id]/ingest-brd` already/should call `draft-brd`; the wizard's Docs
  step uses it, surfacing candidates for approval (never auto-apply).

## 5. UI — `src/app/(app)/projects/new/…` wizard (or a full-screen dialog)
Steps (match wireframe), all draft-saved in component state, `useAdminMutation` on submit:
1. **Basics** — name, auto-suggested code (from `projectCodeBase`, editable), portfolio
   (required, defaults to picker), programme (optional).
2. **Type & delivery** — project type → checkpoint template (cards); pipeline stage chips.
3. **Markets** — Market org-unit chips, pre-filled from the portfolio's `defaultMarkets`.
4. **Team** — the P1-C assignment panel embedded (team template + capacity/leave checks).
5. **Docs & requirements** — attach docs; "Review Q's suggestions" → the ingest review
   screen; approved requirements persist with source anchors.
6. **Integration** — YouTrack base URL + project + field map (skippable; `FEATURE_YOUTRACK`).
7. **Review** → submit. On success, route to the new project workspace Overview.

## 6. Acceptance
- Creating via the wizard yields a project with the right portfolio/programme, checkpoint
  template (Delivery tab shows those gates), market tracks, members with role+allocation,
  and (if provided) a YouTrack link that populates the board.
- Draft survives step navigation; code auto-suggests and de-dupes; portfolio is required.
- BRD ingest only applies approved items; requirements keep source anchors.
- No task is created in QUBIT (tasks are YouTrack-only, `docs/25 §1`).
- Audit row on create; RLS holds.

## 7. Tests
- `tests/rls/project-wizard.test.ts`: create with template+markets+members seeds
  `ProjectOrgStatus` + `ProjectMember` correctly; pipeline stage set; cross-tenant isolation.
- `tests/unit/project-code.test.ts` (extend if exists): `projectCodeBase` cases.
- Reuse `tests/rls/youtrack-sync.test.ts` for the integration wiring.

## 8. Verify
```bash
pnpm prisma migrate dev && pnpm prisma generate   # only if the optional column was added
pnpm typecheck && pnpm lint
pnpm test -- project-wizard youtrack
```
Commit: `feat(ppm): guided project creation wizard (P1-B)`.
