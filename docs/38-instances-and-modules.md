# 38 — Products, instances and modules (configurable per project)

Status: PROPOSED 2026-10-07 (Joyce: "let it all be configurable to give options"). Supersedes the
per-market project shells (ZED ERP — Kenya …, Swipe Agent Banking — Kenya …) with ONE project per
product that carries **instances** (markets or subsidiaries) and **modules** (POS, USSD, Marketplace…).
Builds on docs/18 §3 (market tracks) rather than replacing it. Decision record: DM1.77.

> **Vocabulary fixed by Joyce (2026-10-07, after I1 was built):** *markets* and *subsidiaries*
> are the same thing — the org units a product ships to (Kenya, Uganda …); there is no
> "ships to markets / subsidiaries / either" choice. An **instance** is a NAMED variant of
> the product (Asset Valuation *for Schools*, *for Marketplace*; Swipe *POS*, *USSD*) that
> acts like a single project: its own gate states, recorded with the same track in every
> market the product ships to, and a state per market. In the schema that is
> `project_module` + `module_instance_status` (+ `checkpoint_status.module_id`); the code
> calls it `project-instances.ts`, the org-unit layer `markets.ts`. Everywhere below, read
> "instance (org unit)" as **market** and "module" as **instance**. `instanceLabel` and
> `moduleTracking` stay as columns but are not offered in the UI (always Market / gates).
> **Modules kept (Joyce, 2026-10-07, later the same day):** a *module* is a component or
> channel of the product or of one instance (Swipe P20 POS, USSD, Agent Portal …), tracked
> by a state per market; **whether a module has its own gates is an option chosen when it
> is added** (and switchable later). Same table (`project_module.kind = module`,
> `parent_id`, `own_gates`); engine `project-instances.ts`; Modules grid on the Delivery tab.

## 0. What exists, what is missing (read-only audit, 2026-10-07)

- A project already has **market tracks**: `ProjectOrgStatus` (project × `OrgUnit` kind=Market), gate
  states per track (`CheckpointStatus.orgUnitId`), a weekly `MarketCheckIn`, the rollout heatmap
  (`getRolloutMatrix`) and the market page `/projects/[id]/markets/[orgUnitId]`. The wizard creates
  tracks from `marketIds`. ZED and Swipe portfolios are already `viewKind = Rollout`.
- But: nothing in the app can **edit** a market's gates (`setCheckpointState` hard-codes
  `orgUnitId: null`); nothing updates a track after creation; `marketRagsForProject` reports the
  stored `progress`, not the derived one; every reader filters `kind = "Market"` so a subsidiary can
  never be an instance; there is no admin UI for org units at all.
- There is **no module concept** (`AppModule` is the RBAC feature registry — unrelated; the new model is
  `ProjectModule`). Tasks, documents, risks, issues, blockers and milestones have no instance column.
- Prod: the 14 ZED/Swipe per-market projects are empty shells (0 tasks, docs, risks, check-ins, gate
  states, members, leads). Merging them is a create-and-archive, not a data migration.

## 1. The model

```
Portfolio (ZED ERP · Swipe Agent Banking · AI Initiatives)
 └─ Project = the PRODUCT (ZED ERP, Swipe Agent Banking, Asset Valuation)   one PM, one weekly line
     ├─ Instance  = where it ships: a market (KE, UG…) or a subsidiary        = ProjectOrgStatus
     │     ├─ gate states per instance (exists)  · weekly instance check-in (exists)
     │     ├─ optional instance lead (new)       · per-instance setup checklist (new)
     │     └─ module states for this instance (new)
     └─ Module    = a trackable part of the product (P20 POS, USSD, Agent Portal, Marketplace)   new
           ├─ state per instance: N/A · Planned · Build · UAT · Live                (always)
           └─ its own gates + derived progress                                     (when configured)
```

The Swipe deck maps 1:1: six instances × six modules, each cell LIVE / UAT / N/A, plus "Hal device
support" as a seventh module; "5 of 6 markets in production" = instances whose applicable modules are
all Live. Asset Valuation = one project, no instances yet, one module "Marketplace" tracked with gates.

## 2. Per-project configuration (the "options")

Four settings on `Project`, chosen in the wizard's new **Structure** step and editable later in the
workspace (Details › Edit, governance rights). Defaults in brackets.

| Setting | Values | Effect |
|---|---|---|
| `instanceLabel` | `Market` · `Subsidiary` · `Instance` [`Market`] | Wording everywhere, and which `OrgUnit.kind` the pickers offer (Market → kind Market; Subsidiary → kind Internal; Instance → both). |
| `moduleTracking` | `state` · `gates` [`state`] | `state`: a module has a state per instance only. `gates`: each module also carries its own gate statuses (`CheckpointStatus.moduleId`) and a derived %, shown as its own row in Delivery. |
| `instanceTagging` | on / off [on when the project has instances] | Tasks, documents, risks, issues, blockers and milestones can carry an instance (and module) tag; the header switch filters every tab by it. Off = tags hidden, nothing filtered. |
| `pmScope` | `product` · `instance` [`product`] | `instance`: each instance may have its own lead (`ProjectOrgStatus.leadUserId`); instance leads count as the project's PMs for "My projects", the work queue, the Reports queue, nudges and the inbox's PM name, and see the product with their instance pre-selected. |

A project with **no instances** behaves exactly as today (the switch and the Instances tab do not
render); modules still work at product level (one state column, "Product").

## 3. Schema (one migration, RLS on every new table, DM1.18 tenant loops for backfills)

- `Project`: `instanceLabel String @default("Market")`, `moduleTracking String @default("state")`,
  `instanceTagging Boolean @default(true)`, `pmScope String @default("product")`.
- `ProjectOrgStatus` (= instance): `+ leadUserId String?`, `+ note String?`, `+ addedById`, keep
  `progress`/`status`; `onDelete: Cascade` on project. `status` becomes derived from module states when
  modules exist (all Live → Live, any UAT → UAT …) else from gates, with `progress` always derived.
- `ProjectModule { id, tenantId, projectId, code, name, orderIndex, checkpointTemplateId?, createdAt,
  updatedAt }` unique `[projectId, code]`.
- `ModuleInstanceStatus { id, tenantId, projectId, moduleId, orgUnitId? (null = product level),
  state NotApplicable|Planned|Build|UAT|Live, note?, updatedById, updatedAt }` unique
  `[moduleId, orgUnitId]` + partial unique on the null case (same trick as `CheckpointStatus`).
- `CheckpointStatus`: `+ moduleId String?`; unique becomes `[projectId, checkpointId, orgUnitId,
  moduleId]` with partial indexes for the null combinations.
- Tags: `orgUnitId String?` and `moduleId String?` on `ProjectTask`, `ProjectDocument`, `Risk`, `Issue`,
  `Blocker`, `ProjectMilestone`; index `[projectId, orgUnitId]`. On `ProjectTask` the tags are
  local-only unless the YouTrack field map writes them (§5).
- `prisma/rls.sql`: `project_module`, `module_instance_status`.

## 4. Server

- `src/server/instances.ts` (new): `listInstances`, `addInstances` (any org unit the project's
  `instanceLabel` allows), `removeInstance` (refused while it has tagged work or check-ins; "archive"
  = keep the row, flag `status: Retired`), `setInstanceLead`, `setInstanceNote`, `getInstanceSetup`
  (gates for that instance, documents/blockers tagged with it, the instance check-in this week, lead).
  All audited (`entityType: "project_instance"`), events `instance.added|lead_changed|retired`.
- `src/server/modules.ts` (new): module CRUD (audited `project_module`), `setModuleState(ctx,
  projectId, moduleId, orgUnitId|null, state, note)` → event `module.state_changed`; `moduleGrid(ctx,
  projectId)` → rows modules × columns instances (+ "Product" column when no instances or for
  product-level modules); when `moduleTracking = gates`, `getModuleGates`/`setModuleGate` reuse the
  checkpoint engine with `moduleId`.
- `src/server/checkpoints.ts`: `getProjectCheckpoints(ctx, projectId, scope?: { orgUnitId?, moduleId? })`
  and `setCheckpointState(…, { …, orgUnitId?, moduleId? })`; audit `entityId`
  `${projectId}:${checkpointId}:${orgUnitId ?? "-"}:${moduleId ?? "-"}`. This gives instance gates their
  first edit path. `gatesBlocked` in `computeCheckInDraft` keeps counting product-level gates only
  (instance RAG already flows through `dualTrack`).
- `src/server/rollout.ts`: drop the `kind = "Market"` filters (instances are whatever the project has);
  `marketRagsForProject` reports derived progress; the heatmap columns become the union of the
  portfolio's instances; cell click gains the module grid for that project × instance.
- `src/server/project-wizard.ts`: `marketIds` → `instanceIds` (accept the old name), `modules[]`,
  the four settings, and per-instance leads when `pmScope = instance`; `BAD_MARKET` → `BAD_INSTANCE`.
- `src/server/projects.ts`: the four settings on `UpdateProjectInput` (governance rights), on
  `ProjectPanelData` and `ProjectListItem` (+ `moduleCount`).
- Ownership (`dashboard-cockpit.ts pmIds`, `reports-week.ts` PM scope, `nudger pmByProject`,
  `status-report-upload matchableProjects`, `tour.ts`, `access.ts canWriteProject`): when
  `pmScope = instance`, instance leads are PMs of the product too. `canWriteProject` stays
  project-wide (an instance lead can edit the product — simple, auditable; revisit if abused).
- Lists: `listProjectTasks`, `listDocuments`, `listRisks`, `listIssues`, `listBlockers`,
  `listMilestones` accept `{ orgUnitId?, moduleId? }`; create/update inputs accept the tags only when
  `instanceTagging` is on (else 400 `TAGGING_OFF`). Materialising a risk and blocking a task copy the
  tags. `getProjectProgress` honours the same filter so the board's % matches its rows.
- `src/server/project-setup.ts`: `getProjectSetup` unchanged for the product; `getInstanceSetup`
  (above) feeds a per-instance checklist and the tour's set-up track when an instance is selected.
- Admin › Organisation (`src/server/org-units.ts` + `/api/admin/org-units`): list/create/rename/retire
  org units (kind Market or Internal, code, name, flag) — today they exist only in the seed. The
  Riverbank flat-tenant rule (DM1.1) is untouched: Internal units stay out of nav unless a project
  uses them as instances.

## 5. YouTrack

`ProjectIntegration.config.fieldMap` gains `instanceField` and `moduleField` (field names, e.g.
`"Market"` / `"Subsystem"`) with value → id maps (`instances: { "Kenya": orgUnitId }`,
`modules: { "USSD": moduleId }`); the sync writes `ProjectTask.orgUnitId/moduleId` and lists them
in `OWNED_FIELDS` only when mapped. The bulk-connect screen (Admin › Integrations) gets the two
field names as optional columns. Unmapped → tags stay local and editable from the board card.

## 6. UI (Impeccable, existing tokens; one inspection round)

- **Workspace header**: an instance switch beside the title chips — `All` · `KE` · `UG` … (flags,
  overflow menu past six) — written to `?instance=`; the Build/In-market chips become `Build` +
  `{instanceLabel} · {rag}`; the facts line's "Markets ·" fact becomes the switch's summary.
- **This week** with an instance selected: the status card shows that instance's weekly check-in
  (editable inline — the market page becomes a deep link, not the only editor); the Markets side card
  becomes "Instances" with lead, state and progress per row.
- **Delivery**: gates matrix scoped to the selection (product or instance, now editable);
  **Modules grid** below it — rows modules, columns instances (or "Product"), cells a state pill
  (click → state picker + note; in `gates` mode the cell also opens the module's gate list and shows
  its %); "Add module" inline. The In-market tiles are replaced by the grid.
- **Instances tab** (only when the project has instances or `instanceLabel` ≠ none): add/retire
  instances, lead per instance (when `pmScope = instance`), per-instance setup checklist, note.
- **Board / Documents / Register / Milestones**: filtered by the switch when tagging is on; create
  forms get an instance (and module) picker defaulting to the current selection; rows show a small
  tag.
- **Wizard**: Basics → **Structure** (label, instances, modules, the four switches with one-line
  explanations, instance leads when `pmScope = instance`) → Team → Review. Draft-key bump; step
  clamp checked.
- **Portfolio heatmap / exec**: columns = the portfolio's instances; cell click → module grid.
- **Reports**: the one-pager (`market.ts`/`dual.ts`) gains the module × instance table and the
  "N of M instances live" KPI; the digest's market summary counts instances; the status-report
  parser recognises a channels-by-instance table (rows instances, columns modules, cells
  LIVE/UAT/N/A → module states) in Word/Excel/PDF and the PowerPoint grid.
- **Admin › Organisation**: org units table + add dialog.

## 7. Prod tidy-up (one audited script, run on the box under the tenant RLS context)

1. Create `ZED` "ZED ERP" (portfolio ZED ERP, Rollout) with instances BI, DRC, KE, RW, SS, TZ, UG;
   `SWIPE` "Swipe Agent Banking" with instances BI, KE, RW, SS, TZ, UG and modules P20 POS, P30 POS,
   NewPOS9220, USSD, Agent Portal, Mobile App, Hal device support — states seeded from the 29 Sep
   deck (Kenya all Live; UG/BI/SS Live except P20/P30 N/A; TZ NewPOS Live + USSD/Portal/App UAT;
   RW all UAT; Hal Live in five, Rwanda not yet).
2. Asset Valuation: `moduleTracking = gates`, module "Marketplace".
3. The 14 shells: status `Cancelled` + statusNote "Merged into {code} as an instance (docs/38)";
   they vanish from every active list and stay in the audit trail. Leads/members: none to move.
4. Verify by row count under RLS (DM1.18) and in the UI.

## 8. Delivery order (each step deployable, CI green, Joyce reviews between them)

- **I1 — Instances**: §3 (all columns, so one migration), `instances.ts`, checkpoint scope,
  rollout relax, settings on Project + governance editor, wizard Structure step (instances + settings),
  header switch + Instances tab + instance check-in in the status card, Admin › Organisation,
  `pmScope = instance` ownership, prod tidy-up for ZED/Swipe (instances only). Tests: RLS
  `instances.test.ts`, `checkpoints-scope.test.ts`, wizard test update, unit for derived state.
- **I2 — Modules**: `modules.ts`, grid UI, `gates` mode, wizard modules, Swipe module seed + Asset
  Valuation Marketplace, reports (one-pager grid, digest counts), parser grid. Tests: RLS
  `modules.test.ts`, unit parser grid + state normaliser.
- **I3 — Tagging + YouTrack**: list filters, create pickers, tag chips, YouTrack field map + sync +
  bulk-connect columns, per-instance setup checklist in the tour. Tests: RLS `instance-tagging.test.ts`,
  youtrack mapper unit.

Out of scope: a module having its own PM; instances nested under instances; cross-project modules.
