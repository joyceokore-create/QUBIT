# Riverbank onboarding runbook (MVP1 Phase D)

How to load **real** Riverbank people, departments, teams, projects and resource
allocations into QUBIT with `scripts/import-riverbank.ts`. The importer is **idempotent**
and **dry-run by default** — nothing is written until you pass `--execute`.

> **Data handling (non-negotiable).** Real names/emails are PII. They live only in your
> filled-in CSVs and the database — **never commit them**. The working directory `import/`
> is git-ignored. The templates in `docs/onboarding/templates/` are synthetic
> (`@example.invalid`) — copy them out, fill with real data, and keep them out of git.

## 1. Prepare the CSVs

```bash
mkdir -p import
cp docs/onboarding/templates/*.csv import/    # then edit import/*.csv with real data
```

All five files are optional; include the ones you have. Load order and dependencies are
handled for you (departments → people → teams → projects → allocations).

| File | Columns | Notes |
|---|---|---|
| `departments.csv` | `name,parent,head` | `parent` = another department's **name** (any row order — parents resolve in a second pass). `head` optional. |
| `people.csv` | `name,email,roles,department,manager` | `roles` = `\|`-separated (see valid roles below); defaults to `Viewer`. `department` by name, `manager` by email. |
| `teams.csv` | `name,description,lead,members` | `lead` = email; `members` = `\|`-separated emails. |
| `projects.csv` | `code,name,description,type,priority,status,dueDate,budget,lead` | `code` is the unique key. `dueDate` = `YYYY-MM-DD`. `lead` = email. |
| `allocations.csv` | `projectCode,email,role,allocationPct` | Assigns a person to a project with a role + %; re-running **updates** the allocation. |

**Valid values**
- **roles**: `SystemAdmin`, `PortfolioManager`, `ProjectManager`, `FinanceManager`, `Contributor`, `Viewer`, `DepartmentHead` (unknown roles → `Viewer`, with a warning).
- **type**: `Project` or `Programme`.
- **priority**: `Low`, `Medium`, `High`, `Critical`.
- **status**: `Planning`, `OnTrack`, `AtRisk`, `Overdue`, `Completed`, `Cancelled`.

## 2. Dry run (no writes)

```bash
pnpm tsx scripts/import-riverbank.ts --dir ./import
```

Prints a plan (created/skipped per entity) and **warnings** — unresolved managers,
missing departments, members/allocations pointing at unknown people/projects. **Fix the
CSVs until the dry run is warning-free.**

## 3. Execute

```bash
pnpm tsx scripts/import-riverbank.ts --dir ./import --execute
```

Writes under one Riverbank `withTenant` transaction (RLS-scoped) and emits
`import/import-report.json` containing counts, warnings, and a **temp-credentials list**
(a random password per newly-created user).

Re-running is safe: existing users/departments/teams/projects are **skipped**;
allocations are **upserted**. So you can import in waves as data arrives.

## 4. Hand off credentials + secure the accounts

1. Distribute each user's temp password over a **secure channel** (not email/Slack in
   clear). The report file is the only place they exist — **delete `import/import-report.json`
   once distributed.**
2. Ask users to sign in and immediately **reset their password**.
3. **Enable MFA (TOTP)** for privileged accounts (SystemAdmin / PortfolioManager) at
   `/settings/mfa`.

## 5. QA in the UI

Sign in as an admin and verify:
- **Admin → Users**: everyone present with the right roles/org units (the Q · Admin
  insights rail flags anyone with no org unit or single-admin risk).
- **Projects / project panel**: projects, leads, and **Resources** (people + %); **Teams**
  assigned. **People**: allocations and over-allocation.
- **Ask Q → Portfolio summary** (or "Ask Q about this project"): the report reflects the
  imported data.

## Notes / fast-follows
- Onboarding creates users **ACTIVE with a temp password** (admin-set). A real
  **email-invite** flow is a fast-follow.
- Cross-tenant safety: the importer only ever writes to the `--tenant` you name
  (default `riverbank`) under RLS — it cannot touch another tenant's data.
