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
16. **19-consolidation-and-module-revamp-plan.md** — **current active plan** (2026-08-03):
    audit-driven consolidation + module-by-module revamp of the ideation→rollout reporting
    spine (onboarding, YouTrack sync, member→PM→Head of PMs→Exec reporting), operational
    hardening, and the new Head-of-PMs roll-up layer. Read after 16/17/18.
17. **20-onboarding-rebuild-spec.md** — onboarding & IAM rebuild design + milestones
    (M-O1…M-O4). M-O1 (security fixes) and M-O2 (shared CRUD foundation) are **implemented
    in the tree**; §7/§8 are their change logs.
18. **21-mo2b-admin-shell-execution.md** — execution spec: shared AdminTable/AdminFormDialog,
    unify teams + departments (structural, no schema).
19. **22-mo3-invite-tokens-email-execution.md** — execution spec: token-based email invites,
    resend/reset (Prisma migration + Graph mailer).
20. **23-mo4-guided-first-login-execution.md** — execution spec: guided first-login
    (password → MFA enrolment → confirm role → land) + recovery codes (Prisma migration).

    Execution specs 21–23 are written for Claude Code: read the spec, implement, verify with
    the listed commands, stop for review. Order: 21 → 22 → 23.
21. **24-workflow-notes-transcription.md** — transcription of the handwritten workflow notes
    (Exec + PM pages), reconciled with the 2026-08-03 decisions.
22. **25-delivery-reporting-workflow-spec.md** — the delivery + reporting workflow: read-only
    YouTrack tasks, one board per project, role×surface matrix, member→PM→Head→Exec chain.
    Pairs with `wireframes/qubit-workflow-wireframes.html`.
23. **26-first-principles-redesign.md** — whole-product rethink (four loops, lifecycle spine,
    IA, onboarding+assignment, wizards, gaps, sequencing P0–P5). The vision doc.
24. **27–31 — Phase 1 "Create & Assign" execution specs** (for Claude Code; order A→E):
    - **27-p1a-portfolio-programme-wizards.md** — portfolio/programme create + wizards (category, lens).
    - **28-p1b-project-wizard.md** — guided project creation wizard.
    - **29-p1c-assignment-capacity.md** — dated allocations + capacity/leave-aware assignment.
    - **30-p1d-resource-requests.md** — PM raise → Head fill staffing flow (new model).
    - **31-p1e-org-setup-wizard.md** — one-time organisation setup wizard.
    Pairs with `wireframes/qubit-wizards-wireframes.html`.
    **Build status:** P1-A…P1-D shipped 2026-08-04 (DM1.51–54) via
    **27-p1-create-assign-execution.md** — its §5 reconciles the shipped build against
    this pack (divergences + open gaps). P1-E is queued after the dashboard remodel.
25. **32-dashboard-remodel-execution.md** — dashboards & nav remodel (exec re-lay +
    category grouping, Head's check-in queue, PM home, programmes index, member slim
    nav). Executes docs/25 W1 with the §9 decisions locked. Milestones M-W1a–c. SHIPPED
    (DM1.55–57).
26. **33-p2-deliver-execution.md** — P2 "Deliver": the one READ-ONLY board (lanes over
    YouTrack states, sync health, authoring retired per docs/25 §1), the Checkpoints &
    Rollout workspace tab, cross-project dependencies. Milestones M-P2a–c. SHIPPED
    (DM1.60–62).
27. **34-p3-report-execution.md** — P3 "Report": in-workspace report authoring (member
    queries → PM check-in → send to Head), the `PortfolioReport` roll-up rung where
    approve FREEZES the payload, and the thin role-composed reports index (the standalone
    generate centre retired). Milestones M-P3a–c. SHIPPED (DM1.63–65).
28. **35-p4-front-of-funnel-execution.md** — P4 "Front of funnel & polish": idea intake +
    triage board (the one lifecycle stage with no surface — docs/26 §5.4), ⌘K command
    search, the notifications centre, and the first-run/a11y sweep. Milestones M-P4a–c.
    NEXT.

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
