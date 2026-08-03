# 27 — P1 Execution Spec: Create & Assign (wizards + staffing)

**Status:** Execution-ready · 2026-08-03
**Executes:** `docs/26 §4.3 + §5` (P1) against the signed wireframes
(`docs/wireframes/qubit-workflow-wireframes.html` → Create/Staffing screens, and
`qubit-wizards-wireframes.html` for the step-by-step wizard content).
**Rule:** one milestone at a time, stop for review. DoD per `CLAUDE.md`.
**Out of scope here:** the dashboard re-lay (docs/25 W1 screens 1–5) and the reporting
chain (P3) — they get their own spec (docs/28) once this lands. Idea intake is P4.

---

## 0. Current state (recon 2026-08-03, what the spec builds on)

| Blueprint concept | Exists today | Gap |
|---|---|---|
| Portfolio | `Portfolio` (name, owner, `viewKind` Pipeline\|Rollout) | no **category** (Approved/Exploring/Shelved); creation is a bare admin form |
| Programme | `Programme` (name, portfolio?, status, budget) | no **category**; no creation surface worth keeping |
| Project | `Project` (code unique/tenant, portfolioId?, `pipelineStage`, `checkpointTemplateId`, lead) | creation is a flat dialog — no wizard, no team/markets/integration steps |
| Markets | `OrgUnit.kind=Market` (M-D-A) + `ProjectOrgStatus` per project×market | wizard must write `ProjectOrgStatus` rows |
| Assignment | `ProjectMember` (role, `allocationPct?`) | **no start/end dates**; no capacity check at assign time |
| Capacity / leave | `listWorkload` (leave-aware, M6-A) + alternates suggestion (M6-B) | not surfaced in any assign flow |
| Resource requests | — | new model + flow |
| Team templates | — | new model + seed |
| Checkpoint templates | `CheckpointTemplate` + seeding (M-D-A) | wizard picks one |
| YouTrack link | `ProjectIntegration` + config panel (M7-C), flag-gated | wizard step reuses it |
| RBAC | `project:create` (Head/PM/QAHead); **no** `portfolio:create` / `programme:create` / staffing keys | add keys |

## 1. Design decisions (locked unless review says otherwise)

1. **Category is a new column on Portfolio and Programme** (`Approved|Exploring|Shelved`,
   default `Exploring`). Projects KEEP `pipelineStage` (Exploring|Evaluating|Approved|
   Paused) — it is the same axis one level down; the projects list shows `Paused` under a
   `Shelved` filter label. No project data migration.
2. **Backfill**: existing portfolios/programmes → `Approved` (they are live delivery
   groupings; everything seeded/created since M18 is in-flight work). DM1.18 tenant loop —
   the migration MUST NOT contain bare DML on a FORCE-RLS table (see DM1.50's fix-up).
3. **Wizard drafts live in `localStorage`** (`qubit.wiz.<kind>.<userId>`), not the DB.
   A half-planned project is a UI nicety, not tenant state of record; nothing else reads
   it, and it dies with the browser profile. (Revisit only if review disagrees.)
4. **Who creates what** (per docs/24 notes + docs/25 §2 matrix):
   `portfolio:create` → Executive, HeadOfProjects (+ SuperAdmin via `*`).
   `programme:create` → same.
   `project:create` → unchanged (Head, PM, HeadOfQA).
   `staffing:manage` (fill/decline requests, see bench) → HeadOfProjects.
   Raising a resource request needs no new key — any project lead/PM via `access.ts`.
5. **An assignment is person + role hat + allocation + dates.** `ProjectMember` gains
   `startDate?`/`endDate?`. Existing rows stay NULL (open-ended) — no backfill lie.
6. **Every wizard "Create" is one transaction** (project + members + org statuses +
   template link), audited per entity, evented (`project.created` etc.) through the
   existing outbox.
7. **Org-setup wizard (docs/26 §4.1) is PARKED**, not built in P1: one real tenant,
   fully seeded; the wizard would automate a job that has no second customer yet.
   Revisit the day a second tenant signs. (Flagged as a deliberate deviation from
   docs/26 §11's P1 line.)

## 2. Milestones

### M-P1a — Schema & keys (no UI)

- `prisma/schema.prisma`:
  - `Portfolio.category String @default("Exploring")`, same on `Programme`.
  - `ProjectMember.startDate DateTime?`, `endDate DateTime?`.
  - New `ResourceRequest`: tenantId, projectId, raisedById, role (project role hat),
    allocationPct, windowStart, windowEnd, note?, status `Open|Filled|Declined`
    (default Open), resolvedById?, resolvedNote?, filledMemberId? (the ProjectMember
    created on fill), timestamps. Indexes: `[tenantId,status]`, `[projectId]`.
  - New `TeamTemplate`: tenantId, name, shape Json (`[{role, allocationPct}]`),
    timestamps. Unique `[tenantId,name]`.
- Migration with **inline RLS** (enable + force + policy) for both new tables, and the
  category backfill **inside the tenant loop**. `prisma/rls.sql` resynced (72→74).
- `src/lib/rbac.ts`: add `portfolio:create`, `programme:create`, `staffing:manage` per
  §1.4. `src/lib/access.ts`: `canRaiseResourceRequest(ctx, project)` = lead/PM of that
  project or Head.
- Seed: "Standard build" template (PM 20 · Tech Lead 40 · Dev 60 ×2 · QA 60 · Impl 50).
- Tests: RLS isolation for both tables; category default+backfill; keys granted/denied.

### M-P1b — Wizard chrome + portfolio & programme creation

- `src/components/wizard/` — shared chrome, matching the wireframe exactly: left rail
  (numbered, ticked, conditional-skip greyed), one-question card, inline error line,
  footer Back/Continue/Create + "Create another", localStorage draft resume.
- `/portfolios/new` (route + 5-step client): Identity → Lens (option cards; Pipeline
  greys the Markets step) → Markets (chips from `OrgUnit.kind=Market`) → Governance
  (recipient defaults; display-only until docs/28 wires recipients) → Review.
  `POST /api/portfolios` gains category/markets; gate `portfolio:create`; audited.
- Programme: one-card dialog (name, parent portfolio, owner, category) from the
  programme page — reuses `AdminFormDialog`; gate `programme:create`.
- Portfolio page re-lay to the wireframe: **category-grouped square cards**, New
  portfolio button only for holders of the key, "add your first programme/project"
  empty state on a fresh portfolio.
- Tests: unit (wizard step logic), RLS (create + read-back per tenant), permission
  denial for PM/Member.

### M-P1c — Project wizard (the centrepiece)

- `/projects/new`, 7 steps per the wireframe:
  1. **Basics** — name, auto-suggested code (existing counter convention), portfolio
     required, programme optional (filtered by portfolio).
  2. **Type & delivery** — checkpoint template cards (from `CheckpointTemplate`);
     stage fixed at Exploring (promotion is governance, not a form field).
  3. **Markets** — pre-filled from portfolio's markets, editable; writes
     `ProjectOrgStatus` rows on create.
  4. **Team** — apply a `TeamTemplate` then adjust; every row role hat + allocation +
     dates; live capacity check per candidate (`listWorkload`) + leave overlap
     (`Absence`), over-allocation warning with alternates (reuse M6-B suggestion
     engine). Warnings never block — they inform and are recorded in the audit blob.
  5. **Docs & requirements** — optional BRD upload into the existing register; if
     `FEATURE_AI` on, offer the existing requirement-extract (human-gated) after create.
  6. **Integration** — YouTrack project key + repo, both optional, both flag-gated;
     writes the existing `ProjectIntegration` config.
  7. **Review** → single-transaction create (§1.6) → land in the new workspace.
- Retire the legacy flat create dialog in `projects-client.tsx` (button routes to the
  wizard).
- Tests: engine-level `createProjectFromWizard` (tx completeness: members + org
  statuses + template + integration all present or nothing), RLS, code uniqueness,
  capacity-warning computation.

### M-P1d — Assignment & staffing

- Workspace **Team tab**: "+ Add member" opens the assign panel (wireframe): bulk pick
  with load% + leave badges, role hat, allocation, dates, warnings + one-click
  alternates. Server: `POST /api/projects/[id]/members` extended for dates + bulk;
  every add audited; assignment event → notification to the assignee.
- **Resource requests**: raise (PM, from assign panel's escape hatch or Team tab) →
  Head's queue at `/staffing` (nav "Staffing" group for PM/Head per wireframe) with
  the bench view (same-role candidates in-window, lowest utilisation first) → fill
  (creates the `ProjectMember`, stamps `filledMemberId`, notifies the PM) or decline
  (reason required). All transitions audited + evented.
- Invite dialog (docs/26 §4.2): add the **role-and-scope preview** line ("Will land on
  the PM dashboard; can manage projects they lead") — pure derivation from the chosen
  roles via existing `landingPersona` + permission summaries.
- Tests: request lifecycle (open→filled/declined, no double-fill), bench ordering,
  leave-window warning, RLS, notification rows.

### Milestone order & review gates

M-P1a → M-P1b → M-P1c → M-P1d, stop-for-review after each. Each leaves the app fully
working; nothing depends on a later milestone.

## 3. Definition of done (per milestone, beyond CLAUDE.md)

- The built screen matches its wireframe (same steps, same warnings, same gating) or
  the deviation is written in the DECISIONS entry.
- Riverbank theming correct; Demo Org B unaffected; RLS isolation test for every new
  table; every mutation audited; `pnpm lint && pnpm typecheck && pnpm test` green;
  browser-verified end-to-end before commit (the M-O4 lesson: tests alone missed the
  finish-gate regression — walk the real flow).

## 4. Open items for review (answer whenever — none block M-P1a)

1. Backfill category `Approved` for all existing portfolios/programmes (§1.2) — or
   should any current portfolio start as `Exploring`?
2. Wizard drafts in localStorage (§1.3) — fine, or do you want server-side drafts so a
   half-planned project survives a device switch?
3. The docs/25 §9 trio (PM dashboard composition, Budget placeholder, slim member nav)
   — needed before docs/28 (dashboards), not before P1.
