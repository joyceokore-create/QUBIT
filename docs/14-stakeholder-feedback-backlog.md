# 14 — Stakeholder Feedback Backlog

Raw notes from a project review meeting, organized into requirements and mapped against the
existing data model / build plan. This is a planning reference, not a milestone — nothing
here is scheduled or built until it's picked up as its own milestone via `EnterPlanMode`,
per `docs/10-build-plan.md`'s working agreement.

No names of individuals are recorded here — see "Pending inputs" at the bottom for the two
items that need a follow-up conversation with the business side; track those out-of-band
(e.g. a ticket assigned to the right person), not in this file, per `CLAUDE.md` rule #3 (no
real personal data in anything committed to git).

## Already satisfied by shipped milestones

- **Overdue project filtering** — Milestone 6's subsidiary view ships an "Overdue" status
  chip (`src/components/subsidiaries/subsidiary-project-table.tsx`); the same status
  vocabulary drives the Group Overview heatmap (Milestone 4) and portfolio/programme rows
  (Milestone 5). If the ask is a **group-wide** overdue filter (across all portfolios, not
  one subsidiary at a time), that's a small gap — see "Group-wide project list" below.
- **Drill-downs** — Group → Portfolio → Programme → Project (Milestone 5) and Group →
  Subsidiary (Milestone 6) both exist end-to-end, including the heatmap's `?sub=` deep-link.
- **Initiatives spanning multiple subsidiaries, compared side-by-side** — already modeled:
  a `Project` has one `ProjectOrgStatus` row per `OrgUnit` it runs in, and the project
  SlidePanel's "Progress by Subsidiary" section (Milestone 5) already shows a per-subsidiary
  comparison (status, progress, milestones) for exactly this case.
- **Organisation structure / user groups** — `Department` (hierarchical, optional per-subsidiary
  scoping via `OrgUnit`) and `User.managerId` shipped schema + admin UI this session
  (`/admin/departments`), empty until entered by hand. RBAC roles (`docs/07-auth-rbac.md`)
  already give role-based dashboard views; whether that's sufficient for "defined user
  groups" for reporting depends on what grouping the business actually needs — see
  "Reporting categorization" below, which is the real gap.

## New requirements, mapped to phase

### Group/executive visibility

- **Group Exco dashboard** — executives need cross-subsidiary project progress at a glance.
  The Group Overview dashboard (Milestone 4) already aggregates across subsidiaries for a
  signed-in user's tenant; what's likely missing is (a) a view tuned for an executive
  audience specifically (less operational detail, more rollup/trend), and (b) confirmation
  of whether "Group Exco" means one tenant's executives or genuinely cross-tenant oversight
  (the latter is what `PlatformSuperAdmin`'s read-only scope was built for, but the actual
  cross-tenant switch UI is still a documented follow-up, not built). **Needs scoping**
  before it's a milestone — likely Phase D executive analytics territory
  (`docs/10-build-plan.md`'s Phase D backlog already lists "executive analytics").
- **Reporting categorization by department × subsidiary** — reporting needs to slice
  cleanly across both axes now that `Department` exists. No rollup/report screen does this
  yet. Phase D (reporting/export).
- **Group-wide project list with filters (incl. overdue)** — a single "all projects across
  every portfolio/subsidiary" table with status filters, as opposed to per-subsidiary
  (Milestone 6) or per-portfolio (Milestone 5) views. Natural extension of the subsidiary
  view's `ProjectTable` component — same pattern, tenant-wide scope instead of one org unit.

### Reporting & export

- **Export a project (or the whole group view) in one shot** — CSV/PDF/PPT export of
  project data. Already anticipated in Phase D backlog ("reporting/export (CSV/PPT)").
  Multi-tenancy doesn't block this — export always runs inside the caller's own
  `withTenant()` scope like every other read, so an export endpoint is additive, not an
  architecture change.
- **Benefit Realization decks for Exco (PPT export)** — same Phase D export capability,
  specifically templated around cost/benefit + outcome data (depends on Cost Benefit
  Analysis existing first — see below).
- **Lessons learned across projects** — no entity for this exists yet. Closest existing
  concept is Milestone 7's RAID gap report (occurred issues vs. owned risks, a
  post-implementation-review style comparison) but that's risk-specific, not a general
  "what did we learn" log. Needs a new entity (e.g. `lesson_learned`: project, category,
  description, recommendation) — Phase B, alongside `decision`/`comment` (already listed).

### Project lifecycle & finance

- **Track a live project's impact and cost/benefit over time** — requires a real Cost
  Benefit Analysis model (target vs. actual benefit, cost-to-date vs. budget) tied to the
  project lifecycle, not just the current `budget: String?` display field
  (`docs/05-data-model.md` already flags Phase A budgets as display strings pending "a
  proper money type... in Phase C finance"). This is the actual prerequisite for both
  "track impact/cost-benefit" and "Benefit Realization PPTs" above — Phase C.
- **Prioritisation criteria** — `Project.priority` is currently a flat
  `Low | Medium | High | Critical` enum with no scoring inputs. The ask is for a structured
  framework (weighted fields feeding into priority) — needs the actual framework defined
  by the business (see "Pending inputs") before schema work starts. Likely Phase B/C
  alongside project templates.
- **Standardized milestone sets per project type** — milestones are currently free-form per
  project (`Milestone.name`/`sequence` set per `ProjectOrgStatus` at creation, no shared
  template). A "milestone template" (e.g. by project type or business-case stage) would let
  every project of a kind carry the same stage names automatically. Maps to Phase B's
  already-listed "project templates" backlog item — needs the actual standard stage list
  from the business (see "Pending inputs").

### Integrations

- **HR system integration** for resource/capacity planning — depends on Phase C's
  `resource`/`allocation` model existing first (already backlogged), then an HRMS
  integration on top (already backlogged generically in Phase D as "HRMS... integrations").
- **Oracle Fusion** — named specifically for two distinct things, worth tracking separately
  even though both fall under the existing generic "ERP integrations" backlog line:
  - **Budgets/vendors**: read (or two-way sync) budget and vendor data from Oracle Fusion
    into QUBIT's Phase C finance module, to avoid maintaining budget figures in two places.
  - **LPO (Local Purchase Order) tracking**: Oracle already owns LPO/procurement process;
    the ask is whether QUBIT needs its own LPO tracking or just a read-only link/status
    pull from Oracle. Recommend the latter (don't duplicate a system of record) — but this
    is a scoping decision for whoever owns the Oracle Fusion relationship, not something to
    guess at in schema design.
- **Existing org/user directory integration** (the business named an internal directory
  platform already used for Teams/reporting-line data) — instead of (or in addition to) the
  admin-UI-entered `Department`/`managerId` data shipped this session, sync org structure
  from that system of record. This would likely replace the "enter by hand" flow with a
  scheduled import job — a bigger architectural addition than the CSV bulk-import already
  tracked as a Department follow-up, since it implies an ongoing sync rather than a one-time
  load. Needs the actual system's integration surface (API? export file? SSO claims?)
  scoped with whoever owns that platform before committing to an approach.

## Pending inputs (from the business, not to be guessed at)

Track these as follow-ups with the relevant business stakeholders — deliberately not naming
individuals in this repo:

1. The standard milestone/business-case stage set every project should share (feeds
   "Standardized milestone sets" above).
2. The prioritization framework / scoring fields (feeds "Prioritisation criteria" above).

## Not yet scoped

- "Group Project → Country Based" was raised as an open question in the meeting, not a
  confirmed requirement. `OrgUnit` already models subsidiaries/countries and every project
  can already be filtered/viewed per subsidiary (Milestone 6); if the actual ask is
  something beyond that (e.g. a country should behave like its own sub-tenant with separate
  access control), that needs to be clarified before any schema change — it would be a
  materially different design from today's single-org-unit-per-project-status model.
