# 00 — Documentation Index

This is the entry point. Read documents in this order.

## Reading order

1. **01-prd.md** — what we're building and why (product requirements).
2. **02-architecture.md** — how it's structured (stack, folders, runtime).
3. **03-dependencies.md** — exact packages and versions to install.
4. **04-multitenancy.md** — the tenant model and RLS (read before any data work).
5. **05-data-model.md** — entities and Prisma schema.
6. **06-api-spec.md** — the API/route contracts.
7. **07-auth-rbac.md** — auth, roles, permissions, audit.
8. **08-design-system.md** — brand tokens and components.
9. **09-ui-spec.md** — screens and interactions.
10. **10-build-plan.md** — the milestone plan to execute.
11. **11-security-compliance.md** — security controls and regulatory context.
12. **12-testing-qa.md** — testing strategy.
13. **13-glossary.md** — terms and naming conventions.
14. **14-stakeholder-feedback-backlog.md** — raw stakeholder feedback mapped to phases;
    reference only, not scheduled work.
15. **15-phase6-delivery-workflow-plan.md** — Phase 6 milestone plan: PM → Dev → QA
    delivery workflow (task taxonomy, role-lens boards, GitHub commit automation,
    nudger + scheduled reports, requirements traceability).

## Document readiness checklist

Everything below is included in this pack and ready for Claude Code.

- [x] Product requirements (PRD)
- [x] Architecture & folder structure
- [x] Dependency list with versions + install commands
- [x] Multitenancy & RLS design
- [x] Data model + Prisma schema
- [x] API / route handler spec
- [x] Auth, RBAC & audit design
- [x] Design system (per-tenant theming)
- [x] UI / screen specification (from the dashboard reference)
- [x] Milestone build plan
- [x] Security & compliance
- [x] Testing & QA strategy
- [x] Glossary & conventions

## What you (the human) still need to provide before/at build time

These are environment- and org-specific and can't be pre-baked into the docs:

1. **Postgres database** — a local or hosted PostgreSQL 17 instance and its connection URL.
2. **Auth secrets** — `AUTH_SECRET`, and OAuth/SSO client IDs/secrets if using Azure AD SSO.
3. **Tenant seed facts** — the real list of Riverbank and KCB sub-organisations/subsidiaries
   (synthetic placeholders are provided to start).
4. **Brand assets** — Riverbank and KCB logo files (SVG/PNG). Placeholder marks are specified.
5. **Integration endpoints** (later phases) — Azure AD, HRMS, ERP, ServiceNow test endpoints.
6. **Hosting target** — where it will run (Vercel, Azure, AWS, or on-prem) for deploy config.

## One-paragraph brief

QUBIT gives Riverbank and KCB a single, tenant-isolated view of every portfolio,
programme and project across their sub-organisations, with a RAG health heatmap, drill-down
from group to subsidiary, RAID (risk/issue/change) tracking, role-based access, a complete
audit trail, and per-tenant branding. The first build target is the executive dashboard and
core PPM hierarchy exactly as shown in `qubit_exec_dashboard.html`, generalised to work for
both tenants under strict data isolation.
