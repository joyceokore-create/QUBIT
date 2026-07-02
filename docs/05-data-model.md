# 05 — Data Model

Derived from the dashboard reference and the QUBIT feature set. Phase A entities are marked
**[A]**; later phases **[B]/[C]/[D]**. Every tenant-owned table has `tenant_id`,
`created_at`, `updated_at`; RLS applies (see `04-multitenancy.md`).

## Entity summary

| Entity | Phase | Notes |
|--------|-------|-------|
| tenant | A | Top-level org; brand tokens; NOT itself tenant-scoped |
| org_unit | A | Sub-organisation / subsidiary (e.g. KCB Kenya) |
| user | A | Belongs to one tenant; auth identity |
| role_assignment | A | User↔role with optional scope |
| portfolio | A | Groups programmes/projects; owner; target budget |
| programme | A | Sits between portfolio and projects |
| project | A | Project or standalone; priority; status; due; budget |
| project_org_status | A | Per-subsidiary progress + milestones for a project |
| milestone | A | Named milestone with status (done/active/late/pending) |
| risk | A | Owner, probability, impact, mitigation, status |
| issue | A | Materialised problem; links back to a risk |
| change_request | B | Scope/schedule/budget change; approval routed |
| task | B | Work item; status/priority/assignee/due |
| comment | B | Threaded, on task/project; @mentions |
| decision | B | Decision log; immutable once logged |
| document | B | File metadata; versioned |
| notification | B | Per-user in-app/email notifications |
| approval_policy / approval_request / approval_step | C | Policy-driven approvals |
| resource / allocation | C | Capacity & assignment |
| timesheet / time_entry | C | Time logging |
| budget / purchase_order / invoice / expense / cost_centre / fx_rate | C | Finance |
| audit_log | A | Every mutation on tracked entities |

## Enums

```
Status:      Planning | OnTrack | AtRisk | Overdue | Completed | Cancelled
Priority:    Low | Medium | High | Critical
ItemType:    Project | Programme
MilestoneSt: pending | active | done | late
RiskStatus:  Open | Monitoring | Mitigated | Closed | Materialised
IssueSev:    Low | Medium | High | Critical
Role:        SystemAdmin | PortfolioManager | ProjectManager | FinanceManager
             | Contributor | Viewer | DepartmentHead | PlatformSuperAdmin
```

Note the dashboard's four RAG labels map to `Status`: On Track → `OnTrack`, At Risk →
`AtRisk`, Overdue → `Overdue`, plus `Planning`. Progress percentages live on
`project_org_status`, and a project's overall progress is the average across its
subsidiaries (as the reference does).

## Prisma schema (Phase A extract)

```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Tenant {
  id          String   @id @default(uuid())
  slug        String   @unique          // "kcb" | "riverbank"
  name        String                     // "KCB Group"
  brandColor  String                     // "#1B7A3E"
  brandLight  String                     // "#E8F5EE"
  domains     String[] @default([])      // email domains that resolve to this tenant at login
  orgUnits    OrgUnit[]
  users       User[]
  portfolios  Portfolio[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model OrgUnit {                          // subsidiary / sub-organisation
  id        String  @id @default(uuid())
  tenantId  String
  tenant    Tenant  @relation(fields: [tenantId], references: [id])
  code      String                       // "KE","UG","TZ","RW","SS"
  name      String                       // "KCB Kenya"
  flag      String?                      // emoji/asset ref
  @@unique([tenantId, code])
}

model User {
  id            String   @id @default(uuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  email         String
  name          String
  passwordHash  String?
  mfaSecret     String?                  // encrypted at rest
  status        String   @default("ACTIVE")  // "ACTIVE" | "SUSPENDED" | "DELETED"
  deletedAt     DateTime?                 // set by soft-delete (FR-IAM-01); see Admin & IAM v1
  roles         RoleAssignment[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([tenantId, email])
}

model RoleAssignment {
  id         String  @id @default(uuid())
  tenantId   String
  userId     String
  user       User    @relation(fields: [userId], references: [id])
  role       String                       // Role enum value
  scopeType  String?                      // "portfolio" | "orgUnit" | null
  scopeId    String?
}

model Portfolio {
  id          String     @id @default(uuid())
  tenantId    String
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  name        String
  description String?
  type        String?                     // Strategic | Operational | ...
  ownerId     String?
  targetBudget String?                    // display string e.g. "KES 2.8B" (store minor units later)
  programmes  Programme[]
  projects    Project[]
}

model Programme {
  id          String    @id @default(uuid())
  tenantId    String
  portfolioId String?
  portfolio   Portfolio? @relation(fields: [portfolioId], references: [id])
  name        String
  description String?
  status      String                      // Status enum
  budget      String?
  projects    Project[]
}

model Project {
  id          String    @id @default(uuid())
  tenantId    String
  code        String                       // "P001"
  name        String
  description String?                      // added Milestone 5 — the original extract omitted it
  type        String                       // ItemType
  portfolioId String?
  programmeId String?
  portfolio   Portfolio? @relation(fields: [portfolioId], references: [id])
  programme   Programme? @relation(fields: [programmeId], references: [id])
  priority    String
  status      String
  dueDate     DateTime?
  budget      String?
  team        String?                      // free-text placeholder, e.g. "Project Lead,
                                             // Contributor" — never real employee names;
                                             // real per-person assignment is Resource/
                                             // Allocation (Phase C)
  orgStatuses ProjectOrgStatus[]
  risks       Risk[]
  issues      Issue[]
  @@unique([tenantId, code])
}

model ProjectOrgStatus {                   // per-subsidiary rollup for a project
  id         String  @id @default(uuid())
  tenantId   String
  projectId  String
  project    Project @relation(fields: [projectId], references: [id])
  orgUnitId  String
  progress   Int                            // 0..100
  status     String
  milestones Milestone[]
  @@unique([projectId, orgUnitId])
}

model Milestone {
  id                 String  @id @default(uuid())
  tenantId           String
  projectOrgStatusId String
  parent   ProjectOrgStatus @relation(fields: [projectOrgStatusId], references: [id])
  name     String
  sequence Int
  state    String                           // MilestoneSt
}

model Risk {
  id           String  @id @default(uuid())
  tenantId     String
  projectId    String?
  project      Project? @relation(fields: [projectId], references: [id])
  title        String
  description  String?
  category     String?
  probability  Int                           // 1..5
  impact       Int                           // 1..5
  mitigation   String?
  ownerId      String?
  status       String                        // RiskStatus
  issue        Issue?                         // set when materialised
}

model Issue {
  id             String  @id @default(uuid())
  tenantId       String
  projectId      String?
  originRiskId   String?  @unique             // traceability back to the risk
  originRisk     Risk?    @relation(fields: [originRiskId], references: [id])
  title          String
  severity       String
  ownerId        String?
  status         String
}

model AuditLog {
  id         String   @id @default(uuid())
  tenantId   String
  actorId    String?
  action     String                          // create|update|delete|tenant_switch
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())
}
```

## Seed data (synthetic)

`prisma/seed.ts` seeds two tenants:

- **KCB Group** — org units KE/UG/TZ/RW/SS and the exact portfolios/programmes/projects/risks
  from `qubit_exec_dashboard.html` (already synthetic).
- **Riverbank Group** — a smaller synthetic set (e.g. 2 portfolios, a few projects across 2–3
  Riverbank org units) so tenant-switching and isolation are demonstrable.

Use only synthetic names/emails (`ada.pm@example.invalid`). No real employee PII.

## Notes for Claude Code

- Budget fields are display strings in Phase A to match the reference; introduce a proper
  money type (integer minor units + currency) in Phase C finance.
- Add the `tenant_id` + RLS policy for EVERY new tenant-owned model (see `04-multitenancy.md`).
- Keep `project.status` derivable/consistent with the worst of its `ProjectOrgStatus` rows
  (Overdue > AtRisk > OnTrack), mirroring the heatmap logic in the reference file.
