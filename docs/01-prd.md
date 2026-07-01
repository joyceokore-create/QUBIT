# 01 — Product Requirements (PRD)

## Vision

A single, KCB- and Riverbank-owned platform that unifies project, programme and portfolio
visibility across each group's sub-organisations, embeds risk governance, and presents an
executive-grade real-time view — with strict tenant isolation and per-tenant branding.

## Tenants

QUBIT is multitenant. Two tenants at launch, each an independent, isolated organisation:

| Tenant | Brand colour | Sub-organisations (examples) |
|--------|--------------|------------------------------|
| **KCB Group** | Green `#1B7A3E` | KCB Kenya, KCB Uganda, KCB Tanzania, KCB Rwanda, KCB South Sudan |
| **Riverbank Group** | Red `#ED1C24` | Riverbank sub-entities / practices (to be confirmed) |

A user belongs to exactly one tenant. Data never crosses tenants. The topbar tenant chip
shows the current tenant; only platform super-admins (Riverbank operators) may switch tenants,
and only via an explicit, audited action.

## Primary users & roles

Roles mirror QUBIT's IAM model (see `07-auth-rbac.md`):

- **System Administrator** — full control within a tenant.
- **Portfolio Manager** — oversees portfolios; approves budgets/allocations; reads reports.
- **Project Manager** — runs projects; manages tasks, risks, change requests.
- **Finance Manager** — financial controls (later phase).
- **Contributor** — works tasks, logs time, raises risks/issues.
- **Viewer** — read-only (auditors, executives).
- **Department Head** — dynamic approval role.
- **Platform Super-Admin** — Riverbank operator; cross-tenant administration only.

## Core objects

Group → Portfolio → Programme → Project → (per-Subsidiary status) → Tasks, plus RAID
(Risks, Issues, Change requests), Milestones and an Audit log. This hierarchy is visible
directly in the dashboard reference file.

## The three governing PMO use cases (priority)

Carried over from the QUBIT Business Requirements Document and treated as first-class:

1. **Risk ownership & monitoring during product development** — every development-phase risk
   has a named owner, probability/impact rating, mitigation and live status.
2. **Pilot-phase test-area identification & reporting (pre-GTM)** — test areas defined,
   tracked and reported to support a go/no-go decision.
3. **Post-deployment risk mapping & gap analysis (PIR)** — materialised risks (issues) trace
   back to the original risk and owner; a gap report supports post-implementation review.

## In scope (build order)

**Phase A — Foundation & Exec dashboard (first):**
- Tenancy, auth, RBAC, RLS, audit.
- Group overview: KPI strip, Portfolio × Subsidiary RAG heatmap, portfolio/standalone cards.
- Drill-down: portfolio detail → programmes → projects; project slide-in panel with
  per-subsidiary milestone matrix.
- Subsidiary filter view with project table.
- RAID: risks & issues (list, create, own, status), escalations feed, upcoming milestones.
- Per-tenant theming.

**Phase B — Core PPM depth:** tasks, Kanban, timeline/Gantt, comments/@mentions,
notifications, decisions, documents, project templates, change requests + approvals.

**Phase C — Resource & Finance:** resources/allocations with approval, timesheets, budgets,
POs, invoices, expenses, cost centres, FX, finance reports.

**Phase D — Intelligence & Integrations:** reporting/export, executive analytics, AI assistant
(risk prediction, summaries), Azure AD SSO, HRMS/ERP/ServiceNow integrations, webhooks,
scheduled actions.

## Out of scope

- Replacing core banking, HRMS or ERP systems (integrate, don't replace).
- Storing customer PII / payment / health data in free-text fields.
- Product-specific business logic that belongs in the products themselves.

## Success criteria (Phase A)

- Both tenants usable with correct branding; zero cross-tenant data leakage (test-proven).
- Exec dashboard renders the full hierarchy and heatmap from live DB data.
- Every risk has an owner and status; escalations feed reflects real data.
- All mutations audited; lint/typecheck/tests green.
