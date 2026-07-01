# QUBIT — Enterprise Project Tracker

## Business Requirements Document

**Organization:** KCB Group PLC
**Prepared by:** Riverbank Solutions Limited (in collaboration with the KCB Project Management Office)
**Document type:** Business Requirements Document (BRD)
**Version:** 1.0 (Draft for review)
**Date:** 1 July 2026
**Classification:** Internal — Confidential

---

## Document control

| Item | Detail |
|------|--------|
| Document title | QUBIT Enterprise Project Tracker — Business Requirements Document |
| Version | 1.0 (Draft for review) |
| Status | For PMO and Architecture Review Board (ARB) review |
| Author | Riverbank Solutions Limited |
| Business owner | KCB Group Project Management Office (PMO) |
| Reviewers | KCB Innovation Lab, KCB Risk Management, KCB IT Architecture, ARB |
| Approver | KCB CIO / ARB (Phase 1 endorsement gate) |
| Distribution | KCB PMO, Innovation Lab, Risk, IT Architecture, Riverbank Solutions |
| Related documents | QUBIT User Guide v1.0; QUBIT vs Microsoft Project Comparison v1.0; QUBIT Enterprise PPM Platform walkthrough deck |

### Revision history

| Version | Date | Author | Summary of change |
|---------|------|--------|-------------------|
| 0.1 | — | Riverbank Solutions | Initial outline from walkthrough and scoping session |
| 1.0 | 1 July 2026 | Riverbank Solutions | First complete draft for PMO / ARB review |

---

## 1. Executive summary

QUBIT is a purpose-built, enterprise-grade Portfolio and Programme Management (PPM) platform for KCB Group. It is designed to give KCB complete, real-time visibility and control across every project, programme and portfolio in the Group, and to embed governed, auditable AI assistance into day-to-day delivery. QUBIT follows a **build-and-own** commercial model: KCB owns the source code, the data and the roadmap, and there are no per-seat licensing fees.

This Business Requirements Document defines the business context, objectives, scope, functional and non-functional requirements, integration and governance needs, and the phased implementation approach for QUBIT across KCB Group's operating markets.

The immediate business need originates with the KCB PMO, which requires a single platform to (1) manage the ownership and monitoring of risks identified during product development, (2) identify and report on test areas for investigation during the pilot phase before full go-to-market (GTM), and (3) map the actual occurrence of risks after deployment back to the risk ownership originally assigned, so that gaps can be identified to support post-implementation review (PIR) and future product evaluation. These three objectives are treated as primary business drivers throughout this document, and the platform's wider capabilities are specified around them.

The document is written for a mixed audience. Executive and PMO readers should focus on Sections 1–7 and Sections 15–17. Technical reviewers (ARB, IT Architecture, Security) should focus on Sections 8–14 and the appendices.

---

## 2. Background and business context

### 2.1 The challenge

KCB Group has expanded across East Africa and now operates across six markets with more than 12,000 employees. This growth has created operational complexity that today's fragmented tooling does not serve well:

- **Visibility gap** — project status, dependencies and risks are scattered across disconnected systems and spreadsheets.
- **Decision delay** — leadership lacks a real-time, cross-market portfolio view on which to base decisions.
- **Resource waste** — there is no unified view of resource capacity, skills and allocation across the Group.
- **Risk blind spots** — emerging risks and bottlenecks are frequently detected too late to mitigate effectively.
- **Compliance risk** — audit trails are fragmented and governance reporting is largely manual.

The business impact is delayed delivery, resource conflicts, missed opportunities and elevated operational and compliance risk across the enterprise.

### 2.2 The opportunity

QUBIT consolidates project delivery, portfolio governance, resource planning, financial control, risk management (RAID), identity and access management, workflow automation and AI assistance into a single platform. It is cloud-native and infrastructure-agnostic (deployable on Azure, AWS or on-premises), and is built for multi-currency, multi-timezone, multi-regulatory operations.

### 2.3 Relationship to product development and risk governance

The PMO's sponsoring use case is product development governance. KCB launches banking products through a lifecycle of development, pilot and full GTM. At each stage, risks must be identified, owned, monitored and — critically — reconciled against what actually happens in production. QUBIT is being evaluated as the system of record that connects **risk ownership at design time** to **risk occurrence at run time**, closing the loop through structured post-implementation review.

---

## 3. Project vision and objectives

### 3.1 Vision

A single, KCB-owned platform that unifies project visibility, optimises resource allocation, and embeds governed AI intelligence across the enterprise — turning project and risk management from a fragmented, manual effort into a strategic, auditable capability.

### 3.2 Business objectives

| ID | Objective | Success indicator |
|----|-----------|-------------------|
| BO-01 | Provide a single source of truth for projects, programmes and portfolios across all markets | One consolidated portfolio view; retirement of parallel trackers |
| BO-02 | Enable ownership and continuous monitoring of risks identified during product development | Every development-phase risk has a named owner and a live status |
| BO-03 | Support pilot-phase test-area identification and reporting before full GTM | Documented, reportable test coverage per pilot; go/no-go evidence |
| BO-04 | Map post-deployment risk occurrence back to original ownership to identify gaps | Traceable link from occurred issue → original risk → owner; PIR gap report |
| BO-05 | Improve resource utilisation and reduce allocation conflicts | Measurable reduction in over-/under-allocation |
| BO-06 | Strengthen governance, audit and regulatory compliance | Complete audit trail; CBK- and Kenya DPA-aligned controls |
| BO-07 | Reduce total cost of ownership and eliminate vendor lock-in | Build-and-own model; no per-seat fees; source-code ownership |
| BO-08 | Embed governed, auditable AI to surface risks and optimise decisions earlier | AI recommendations logged with reasoning; earlier risk detection |

### 3.3 Primary PMO drivers (detailed)

The following three drivers are the reason the PMO initiated this evaluation and are elevated as priority requirements.

**Driver 1 — Risk ownership and monitoring during product development.**
Risks identified while a product is being developed must be captured centrally, assessed for probability and impact, assigned to a named owner, given a mitigation plan, and monitored to closure. Ownership and status must be visible to the PMO and to product sponsors at any time.

**Driver 2 — Pilot-phase test-area identification and reporting (pre-GTM).**
Before a product proceeds to full GTM, the areas requiring investigation and testing during the pilot must be defined, tracked and reported. The platform must make it possible to see which test areas exist, their status, findings, and whether the evidence supports a go/no-go decision.

**Driver 3 — Post-deployment risk mapping and gap analysis (PIR).**
After deployment (pilot or GTM), the risks that actually occur must be recorded and tied back to the risks originally identified and to the owners originally assigned. Where a materialised issue was never foreseen — or was foreseen but not owned or mitigated — that gap must be visible. This supports post-implementation review and informs the evaluation of future products.

*Traceability of these drivers to specific QUBIT features is provided in Appendix A.*

---

## 4. Scope

### 4.1 In scope

- Deployment and configuration of the QUBIT platform on KCB-controlled infrastructure.
- All core modules: projects, tasks, Kanban and timeline views, meetings/documents/decisions, portfolios/programmes/OKRs, resources and allocations, approvals, RAID (risks/issues/change requests), timesheets, financial management, reporting and executive dashboards, search/notifications, administration and IAM, integrations, and the AI assistant.
- Integration with KCB identity (Azure AD / Active Directory), HRMS, ERP and IT service management (ServiceNow), plus issue-tracker synchronisation.
- Governance configuration: roles, permissions, approval policies, audit logging, and AI governance guardrails.
- Phased rollout from Innovation Lab pilot through to full six-market enterprise deployment.
- Change management, training and knowledge transfer to KCB.

### 4.2 Out of scope

- Replacement of KCB's core banking systems, HRMS or ERP (QUBIT integrates with, but does not replace, these).
- Processing of customer PII, payment card data or health information within free-text fields (see Section 11.4).
- Product-specific business logic that belongs in the products themselves rather than in project governance.
- Hardware procurement, which is subject to a separate infrastructure decision by KCB.

### 4.3 Assumptions

- KCB will select and provision the target infrastructure (Azure, AWS or on-premises) before Phase 1 build completion.
- KCB will provide timely access to identity, HRMS, ERP and ServiceNow integration endpoints and test data.
- KCB will nominate business owners, department heads and approvers required by the governance model.
- Network connectivity, SSO and certificate provisioning will be available in each target environment.

### 4.4 Constraints

- The solution must comply with the Central Bank of Kenya (CBK) guidance on cybersecurity and with the Kenya Data Protection Act and equivalent regional regulations.
- Data residency requirements may mandate in-country or in-region hosting for specific markets.
- Phase 1 is gated by ARB endorsement before contract signature.

---

## 5. Stakeholders

| Stakeholder | Role in QUBIT | Primary interest |
|-------------|---------------|------------------|
| KCB CIO / ARB | Sponsor and decision gate | Architecture fit, security, strategic value |
| KCB PMO | Business owner | Project/risk governance, reporting, standards |
| KCB Innovation Lab | Phase 1 pilot host | Early validation, process refinement |
| KCB Risk Management | Governance partner | Risk ownership, AI governance, compliance |
| KCB IT Architecture | Technical authority | Integration, hosting, standards, ARB review |
| KCB HR | Data provider / adoption | Org structure, skills, user onboarding |
| Product / Digital Banking teams | End users | Delivery, pilot testing, GTM readiness |
| Finance | Financial control | Budgets, POs, invoices, cost centres, FX |
| Executives | Consumers of insight | Portfolio health, spend, top risks |
| System Administrators | Platform operators | IAM, configuration, support |
| Riverbank Solutions | Implementation partner | Build, integrate, transfer knowledge |

### 5.1 User roles (platform)

QUBIT uses fine-grained Identity and Access Management. Built-in roles include System Administrator, Portfolio Manager, Project Manager, Finance Manager, Contributor and Viewer, plus the dynamically resolved Department Head role used in approvals. Each role bundles a set of permissions (for example `project:read`, `budget:approve`, `approvals:decide`), and the sidebar and dashboard adapt to the permissions each user holds.

---

## 6. Current state vs future state

| Dimension | Current state | Future state with QUBIT |
|-----------|---------------|-------------------------|
| Project visibility | Fragmented across systems and spreadsheets | Single real-time view across markets |
| Risk management | Ad hoc, local, often reactive | Central RAID register with owners, heatmap, AI early warning |
| Risk-to-outcome traceability | Not maintained | Occurred issues traced back to original risks and owners |
| Pilot test tracking | Manual, inconsistent | Structured test areas with status and reportable findings |
| Resource planning | No unified capacity view | Skills-based allocation with approval and utilisation tracking |
| Financial control | Disconnected from delivery | Budgets, POs, invoices, expenses tied to projects and cost centres |
| Governance & audit | Manual, fragmented | Complete audit trail, policy-driven approvals, role-based access |
| Reporting | Manual assembly | Self-service dashboards, scheduled reports, executive view |
| Cost model | Per-seat subscriptions / add-ons | Build-and-own; no per-seat fees |

---

## 7. Solution overview

QUBIT organises its capabilities into five visibility pillars — Projects, Tasks, Risks, Dependencies and Resources — underpinned by integrated governance (approval workflows, audit trails, role-based access, compliance reporting) and the LUMI AI engine for sovereign, auditable intelligence.

Functionally, the platform combines:

- **Project delivery** — projects, tasks, Kanban boards, timelines, meetings, decisions.
- **Portfolio governance** — portfolios, programmes, OKRs and executive dashboards.
- **Resource planning** — resources, capacity and allocations with department-head approval.
- **Financial control** — budgets, purchase orders, invoices, expenses, multi-currency and fiscal years.
- **Risk management** — risks, issues and change requests (RAID).
- **Identity and access** — fine-grained roles and permissions (IAM).
- **Workflow automation** — a policy-driven approval engine, webhooks and scheduled actions.
- **Integrations and AI** — issue-tracker sync and a governed AI assistant.

---

## 8. Functional requirements

Functional requirements are grouped by module. Priority uses MoSCoW (M = Must, S = Should, C = Could). Requirements marked **[PMO]** directly support one of the three primary drivers.

### 8.1 Project management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PRJ-01 | Users with `project:create` can create projects with name, description, status (Planning, Active, On Hold, Completed, Cancelled), start/end dates, owner, optional portfolio/programme grouping and optional budget | M |
| FR-PRJ-02 | Each project provides tabs for Overview, Tasks, Team, Resources, Risks/Issues/Decisions, Documents, Meetings and Timeline | M |
| FR-PRJ-03 | All project changes (status, dates, owner, budget) are recorded in the audit trail | M |
| FR-PRJ-04 | Projects with active tasks or financial commitments cannot be hard-deleted; they are retired by setting status to Completed or Cancelled | M |
| FR-PRJ-05 | Project templates can be saved (task list, default budget, default team) and instantiated for new projects | S |
| FR-PRJ-06 | Auto-calculated project health / RAG status (On Track, At Risk, Off Track, Critical) is displayed | S |

### 8.2 Task management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TSK-01 | Users can create tasks with title, description, status (Backlog, To Do, In Progress, In Review, Done, Blocked), priority (Low, Medium, High, Critical), assignee, due date and optional parent task | M |
| FR-TSK-02 | Tasks support inline editing, threaded comments and @mentions that notify the mentioned user | M |
| FR-TSK-03 | Admin-defined custom fields can be attached to tasks | S |
| FR-TSK-04 | Recurring task templates can be defined on a daily/weekly/monthly/custom cron cadence, generating a fresh task instance each cycle | S |
| FR-TSK-05 | A Kanban board arranges tasks by status with drag-and-drop status changes and filtering by project, assignee or priority | M |
| FR-TSK-06 | A timeline (Gantt) view shows tasks and projects on a time axis with drag-to-reschedule and dependency/overlap visibility | M |

### 8.3 Meetings, documents and decisions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MTG-01 | Meetings can be captured against a project with title, date/time, attendees and agenda; action items create linked tasks | M |
| FR-DOC-01 | Documents can be uploaded against a project or task (up to 50 MB), described and tagged; same-name uploads create versions while preserving history | M |
| FR-DEC-01 | Decisions can be logged with options considered, rationale, owner and date; decisions appear in the audit trail and cannot be silently changed | M |

### 8.4 Portfolio, programme and OKR management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PPO-01 | Portfolios group related programmes and projects under an owner with a target budget, for executive-level spend and progress tracking | M |
| FR-PPO-02 | Programmes sit between portfolios and projects and represent multi-project initiatives with a shared goal, cross-project dependencies and budget rollup | M |
| FR-PPO-03 | OKRs support objectives with 2–5 measurable key results and automatic roll-up of objective progress | S |
| FR-PPO-04 | Cross-project dependencies within a programme are tracked and their impact analysed | S |

### 8.5 Resource management and allocations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RES-01 | Resources represent people, contractors, equipment or facilities; a user can be mapped to a bookable resource with capacity (hours/week), hourly rate and skill tags | M |
| FR-RES-02 | Resources can be allocated to projects with start/end dates, allocation percentage (or hours/week), role, billing rate and notes | M |
| FR-RES-03 | Every new allocation is submitted to the RESOURCE_ALLOCATION approval policy (Department Head → Portfolio Manager); on approval it becomes ACTIVE, on rejection it is CANCELLED | M |
| FR-RES-04 | Segregation of duties is enforced: the submitter of an allocation cannot approve it | M |
| FR-RES-05 | The platform shows capacity/utilisation status (Available, Partially Allocated, Fully Allocated) and highlights under-utilised and over-allocated resources | S |
| FR-RES-06 | Skills-based matching and capacity/gap analysis are supported to inform allocation decisions | C |

### 8.6 Approvals engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-APR-01 | A policy-driven approval engine applies across budgets, expenses, purchase orders, invoices, change requests and resource allocations | M |
| FR-APR-02 | Policies define entity type, an amount threshold band, and an ordered list of approver roles; multiple banded policies may exist per entity type and can be toggled active/inactive | M |
| FR-APR-03 | Items crossing a policy threshold are submitted automatically and display a pending state until decided | M |
| FR-APR-04 | Approvers see requests where they are the current approver, with subject, amount, requester and per-step status; comments are required for rejections | M |
| FR-APR-05 | Every step decision (who, when, comments) is preserved for audit | M |
| FR-APR-06 | System Administrators can decide steps for emergency/continuity, subject to audit | S |

### 8.7 RAID — risks, issues and change requests **[PMO]**

This module is central to the three primary drivers and is specified in additional detail.

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RSK-01 **[PMO]** | Users can raise risks with title, description, category (technical, financial, operational, regulatory, etc.), probability (1–5), impact (1–5), mitigation plan and a named **owner**; a heatmap rates the risk | M |
| FR-RSK-02 **[PMO]** | Risks can be raised at project level so they are associated with the product/project being developed | M |
| FR-RSK-03 **[PMO]** | Risks are reviewed periodically; a risk can be closed when no longer applicable or **converted to an issue when it materialises**, preserving the link to the original risk and owner | M |
| FR-ISS-01 **[PMO]** | Users can raise issues (something that has happened) with severity (Low/Medium/High/Critical), priority and owner, and track them to closure with comments | M |
| FR-ISS-02 **[PMO]** | An issue arising from a materialised risk retains traceability to that risk, enabling post-deployment mapping back to the original ownership | M |
| FR-CHG-01 | Change requests capture type (Scope/Schedule/Budget/Quality/Resources), justification, impact and proposed change, and route through the CHANGE_REQUEST approval policy (typically Project Manager → Portfolio Manager) | M |
| FR-CHG-02 | Approved changes are recorded against the project for audit | M |
| FR-RAID-01 **[PMO]** | The platform supports reporting that reconciles occurred issues against originally identified risks and their owners, to surface coverage gaps for post-implementation review | M |
| FR-RAID-02 **[PMO]** | Test areas for a pilot can be represented and tracked to status/findings (using tasks, custom fields and/or risks scoped to the pilot project) and reported for go/no-go decisions | M |

### 8.8 Timesheets

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TIM-01 | Contributors can log time per project/task per day and submit weekly for approval | M |
| FR-TIM-02 | Managers can approve or return timesheets with comments | M |
| FR-TIM-03 | Users with `timesheet:read_all` can view, filter and export the global time view | S |

### 8.9 Financial management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-FIN-01 | Fiscal years and a base currency (KES) are configured, with one fiscal year marked current | M |
| FR-FIN-02 | Cost centres mirror the accounting structure and tag every financial transaction | M |
| FR-FIN-03 | Exchange rates are maintained per currency with effective dates; the most recent rate on/before a transaction date is used for conversion | M |
| FR-FIN-04 | Vendors are maintained with contact, KRA PIN, default currency and payment terms | M |
| FR-FIN-05 | Budgets are created against projects or cost centres, submitted for approval (Portfolio Manager → Finance Manager) and become available for commitment once approved | M |
| FR-FIN-06 | Purchase orders commit funds against an approved budget, route through the PO policy and can be marked received | M |
| FR-FIN-07 | Invoices (PO-linked or standalone) route for approval and can be marked paid with date and method | M |
| FR-FIN-08 | Expenses capture category, amount, currency, project, cost centre and receipt, and route for approval | M |
| FR-FIN-09 | Lightweight monthly forecasts (period, category, amount, confidence) feed the executive dashboard and finance reports | S |
| FR-FIN-10 | Finance reports cover budget vs actual, open commitments, approved vs paid invoices, top vendors and currency exposure, with CSV export | M |
| FR-FIN-11 | Multi-currency operations support KES, UGX, TZS, RWF, SSP, USD and others | M |

### 8.10 Reporting and executive dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RPT-01 | An executive dashboard (permission-gated) shows portfolio RAG health, programme progress, top risks across the bank, spend vs budget and approval bottlenecks | M |
| FR-RPT-02 | General reports include resource utilisation, time-tracking summary, project on-time/on-budget metrics and aged invoices/expenses | M |
| FR-RPT-03 | Report tables export to CSV/Excel | M |
| FR-RPT-04 | Custom report definitions, scheduled report distribution and role-based customisable dashboards are supported | S |

### 8.11 Search, mentions and notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SRch-01 | Global search spans projects, tasks, users, comments and decisions, grouped by entity type | M |
| FR-NOT-01 | Notifications cover task assignment, mentions, approvals awaiting the user, allocation/budget/expense decisions, IAM changes and scheduled reminders, delivered in-app and by email | M |

### 8.12 Administration and IAM

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-IAM-01 | Administrators can create, edit, suspend and soft-delete users; soft-delete scrubs PII, invalidates the password, revokes roles and stamps a deletion time while preserving historical references | M |
| FR-IAM-02 | Users can be bulk-uploaded by CSV; roles are granted via IAM after upload | S |
| FR-IAM-03 | Departments carry a name, default role, head and parent; the head field powers the Department Head approval role | M |
| FR-IAM-04 | Roles bundle permissions; custom roles can be created; the permission catalogue is fixed (hard-coded) and browsable | M |
| FR-IAM-05 | Role grants/revocations (with optional project/portfolio/cost-centre scope) are written to the IAM audit log | M |
| FR-IAM-06 | A complete audit log records create/update/delete on tracked entities with actor, timestamp, entity type/ID and before/after snapshot | M |

### 8.13 Integrations and AI

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-INT-01 | Identity integration with Azure AD / Active Directory provides SSO and centralised authentication and user provisioning | M |
| FR-INT-02 | HRMS integration synchronises organisational structure, employee data and skill profiles | M |
| FR-INT-03 | ERP integration covers budget data, cost allocation and financial reporting | M |
| FR-INT-04 | ServiceNow integration supports IT service management, incident correlation and change management workflows | S |
| FR-INT-05 | Issue-tracker synchronisation (e.g. JetBrains YouTrack) polls on a configurable schedule and creates/updates linked tasks | C |
| FR-INT-06 | Configurable webhooks send platform events to external systems (Slack, Teams, custom URLs) with signing and retry | S |
| FR-INT-07 | Scheduled actions run cron-based jobs (email a user, post to a webhook, create a task) | S |
| FR-AI-01 **[PMO]** | The LUMI AI engine can summarise project status, draft meeting notes, suggest risk mitigations and generate status reports, citing the records it used | S |
| FR-AI-02 **[PMO]** | AI risk prediction surfaces emerging risks ahead of impact and flags anomalies such as scope creep and timeline slippage | S |
| FR-AI-03 | AI resource optimisation and what-if scenario modelling inform portfolio decisions | C |
| FR-AI-04 | Every AI recommendation is logged with its reasoning for compliance and review | M |

---

## 9. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Scalability | Support 12,000+ concurrent users at full deployment via horizontal scaling |
| NFR-02 | Performance | Real-time updates via WebSocket; interactive pages respond within acceptable interactive latency under normal load |
| NFR-03 | Availability | Architected for high availability with defined SLAs for the managed-service phase |
| NFR-04 | Security | JWT-based sessions (24-hour expiry), role-based access control, MFA (TOTP), rate-limited login, password policy (min 8 chars, no reuse of last 3) |
| NFR-05 | Encryption | Encryption in transit (TLS), password hashing (bcrypt), and encryption of sensitive settings |
| NFR-06 | Auditability | Complete, tamper-evident activity logging across all entities, including AI recommendations |
| NFR-07 | Data residency | Support in-country or in-region hosting where required by regulation; all data remains within KCB-controlled infrastructure |
| NFR-08 | Portability | Deployable on Azure, AWS or on-premises; cloud-agnostic and containerised |
| NFR-09 | Usability | Responsive web UI usable on any modern browser and device; role-adaptive navigation |
| NFR-10 | Maintainability | Standard, widely-supported technology stack; documented codebase to allow any competent Java team to maintain it |
| NFR-11 | Resilience | Rate limiting and circuit breakers to protect the platform and downstream AI calls |
| NFR-12 | Observability | Health, metrics and info endpoints for monitoring |
| NFR-13 | Interoperability | REST API documented with OpenAPI 3.0 / Swagger for integration and power users |
| NFR-14 | Compliance | Aligned to CBK cybersecurity guidance and the Kenya Data Protection Act and regional equivalents |

---

## 10. Data and integration requirements

| ID | System | Direction | Data / purpose |
|----|--------|-----------|----------------|
| INT-DAT-01 | Azure AD / Active Directory | Inbound | Authentication, SSO, user provisioning |
| INT-DAT-02 | HRMS | Inbound | Org structure, employee records, skills |
| INT-DAT-03 | ERP | Bi-directional | Budgets, cost allocation, financial reporting |
| INT-DAT-04 | ServiceNow | Bi-directional | Incidents, service requests, change management |
| INT-DAT-05 | Issue tracker (YouTrack) | Inbound/sync | Linked task creation and updates |
| INT-DAT-06 | Collaboration (Slack/Teams) | Outbound | Event notifications via webhooks |

**Data classification.** Employee names, emails and phone numbers are treated as confidential personal data. Customer PII, payment data and health information must **not** be entered into free-text descriptions, comments or document uploads; Compliance must be consulted before any customer data is processed through the platform. The platform's soft-delete behaviour scrubs user PII while preserving referential integrity for audit.

> Note: internal environment details such as production URLs and any bootstrap/administrator credentials are deliberately excluded from this document and must be managed through KCB's secrets management and rotated on first use.

---

## 11. Security, compliance and governance

### 11.1 Access control

Fine-grained RBAC with built-in and custom roles, permission-scoped access (project/portfolio/cost-centre), and segregation of duties in approval flows. Navigation and data are hidden where the user lacks permission.

### 11.2 Authentication and session

SSO/AD integration, optional MFA (TOTP), rate-limited login endpoint, strong password policy, and 24-hour JWT session expiry with re-authentication.

### 11.3 Audit and traceability

Every create/update/delete on tracked entities is logged with actor, timestamp and before/after snapshot. IAM grants/revocations and every approval decision are independently auditable. Decisions and approved change requests cannot be silently altered.

### 11.4 Regulatory compliance

The platform is designed for compliance with the Central Bank of Kenya cybersecurity guidance and the Kenya Data Protection Act, with support for regional regulations and market-specific data residency. *Compliance certification and legal interpretation remain with KCB Legal, Risk and Compliance; this document does not constitute a compliance attestation.*

### 11.5 AI governance

AI runs against KCB platform data on KCB-controlled infrastructure. Requirements: KCB-defined ethical guardrails and human oversight, logging of every AI recommendation with reasoning, and no vendor lock-in (source-code ownership and transition support). An AI governance framework workshop is planned jointly with KCB Risk.

---

## 12. Assumptions, dependencies and risks

### 12.1 Dependencies

- ARB endorsement before Phase 1 contract signature.
- Timely provision of integration endpoints, test data and network/SSO access by KCB.
- Nomination of business owners, department heads and approvers.
- Selection of the target infrastructure provider by KCB.

### 12.2 Project risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User adoption across 12,000+ staff | Medium | High | Phased rollout, change management, AI Champions programme, tiered training |
| Integration complexity with legacy systems | Medium | Medium | Early architecture review; schema-aware integration; phased integration in Phase 2 |
| Data residency / regulatory constraints | Medium | High | Cloud-agnostic and on-premise options; in-region hosting; Compliance engagement |
| AI governance and trust | Medium | Medium | Logged reasoning, human oversight, KCB-defined guardrails, governance workshop |
| Internal maintenance capability | Low | Medium | Standard stack, documented codebase, knowledge transfer, managed-service transition |
| Scalability at full deployment | Low | High | Horizontal scaling, connection pooling, load testing before enterprise rollout |

---

## 13. Implementation roadmap

A phased, low-risk rollout over approximately six months.

| Phase | Timing | Scope | Users |
|-------|--------|-------|-------|
| Phase 1 — Foundation | Month 1 | Platform deployed and integrated (Azure AD, HRMS, ERP); Innovation Lab and Digital Banking onboarded; baseline metrics, governance workflows and change management activated; first AI Champions trained | ~50 |
| Phase 2 — Core departments | Months 2–3 | Retail Banking, Risk Management and Operations onboard; PMO governance stood up; LUMI AI activated for risk prediction and resource optimisation; legacy integrations completed | ~500 |
| Phase 3 — Enterprise rollout | Months 4–5 | All remaining departments and subsidiaries; full six-market deployment (Kenya, Uganda, Tanzania, Rwanda, South Sudan, Burundi); cross-market dependency visibility | 12,000+ |
| Phase 4 — Optimisation | Month 6 | Full LUMI AI with scenario modelling; automation tuning; empirical ROI measurement; transition to steady-state | 12,000+ |

**Parallel change management:** Admin bootcamp (5 days), manager training (2 days), user onboarding (half-day) and an ongoing AI Champions programme (≈50 power users).

**Decision gate:** ARB endorsement is required before Phase 1 contract signature (estimated decision within four weeks of the scoping session).

---

## 14. Success metrics and acceptance criteria

| Metric | Target |
|--------|--------|
| Phase 1 adoption among pilot users | 100% |
| Critical infrastructure issues during Phase 1 rollout | Zero |
| Stakeholder satisfaction (Phase 1) | > 4.0 / 5.0 |
| Project visibility baseline | Established (current vs QUBIT state) |
| Development-phase risks with a named owner | 100% |
| Pilot test areas tracked with reportable status | 100% of pilots |
| Occurred issues traceable to an original risk/owner | Measured each PIR; gap report produced |
| Resource over-/under-allocation | Measurable reduction vs baseline |

**Illustrative acceptance criteria (PMO drivers):**

- Given a product in development, when a risk is raised and assigned an owner, then that risk appears in the project's RAID register with owner and live status, and in the top-risks executive view where applicable.
- Given a pilot, when test areas are defined and worked, then a report can show each area's status and findings sufficient to support a go/no-go decision.
- Given a deployed product, when a risk materialises into an issue, then the issue retains a traceable link to the original risk and owner, and a PIR report highlights any occurred issue with no prior owned/mitigated risk.

---

## 15. Commercial and licensing model

QUBIT follows a **build-and-own** model rather than vendor rental:

- **One-off build cost** in Year 1 covers customisation, integration, infrastructure setup and initial training (concrete Statement of Work to be agreed).
- **No per-seat fees** — the implementation cost amortises across the entire 12,000+ workforce, enabling unlimited scaling with no recurring per-user charge.
- **Maintenance and support** structured as a managed service with defined SLAs; KCB's operations team is trained pre-go-live to enable an internal support transition.
- **Exit and continuity** — a 12-month transition clause plus knowledge transfer and source-code ownership ensure KCB is never locked in.

A comparative three-year total-cost-of-ownership analysis against a per-seat alternative indicated substantial savings for the build-and-own model; figures should be confirmed in the SOW. *All commercial figures are subject to the agreed Statement of Work.*

---

## 16. Next steps

| Action / decision | Owner | Timeline |
|-------------------|-------|----------|
| Confirm Phase 1 pilot department and scope | KCB Innovation Lab + Sponsor | Within 2 weeks |
| Provide list of must-have integrations (HRMS, ERP, etc.) | KCB IT Architecture | Within 2 weeks |
| Share current PMO governance model and reporting templates | KCB PMO | Within 1 week |
| Confirm user volumes by role (contributor/viewer/admin) | KCB HR + IT | Within 2 weeks |
| Issue draft SOW with build cost and Phase 1 deliverables | Riverbank Solutions | Within 3 weeks |
| Schedule AI governance framework workshop | Riverbank + KCB Risk | Within 4 weeks |
| Secure ARB endorsement for Phase 1 | KCB CIO + Innovation Lab | Within 4 weeks |

---

## 17. Glossary

| Term | Definition |
|------|------------|
| ARB | Architecture Review Board — KCB decision gate for Phase 1 |
| BRD | Business Requirements Document |
| CBK | Central Bank of Kenya |
| GTM | Go-to-market (full production launch of a product) |
| IAM | Identity and Access Management |
| LUMI | QUBIT's AI engine, providing sovereign, auditable intelligence |
| OKR | Objectives and Key Results |
| PIR | Post-Implementation Review |
| PMO | Project Management Office |
| PO | Purchase Order |
| PPM | Portfolio and Programme Management |
| RAID | Risks, Assumptions/Actions, Issues, and (Change) Decisions/Requests |
| RAG | Red/Amber/Green health status |
| RBAC | Role-Based Access Control |
| SoD | Segregation of Duties |
| SOW | Statement of Work |
| SSO | Single Sign-On |

---

## Appendix A — Traceability of PMO drivers to QUBIT features

| PMO driver | Supporting requirements | How QUBIT meets it |
|------------|-------------------------|--------------------|
| **1. Risk ownership and monitoring during product development** | FR-RSK-01, FR-RSK-02, FR-RSK-03, FR-PRJ-02, FR-RPT-01, FR-AI-02 | Risks are raised at project level with probability, impact, mitigation and a named owner; rated on a heatmap; reviewed periodically; surfaced in the project RAID tab and the top-risks executive view; AI can flag emerging risks early |
| **2. Pilot-phase test-area identification and reporting (pre-GTM)** | FR-RAID-02, FR-TSK-01, FR-TSK-03, FR-RSK-02, FR-RPT-01, FR-RPT-02 | Test areas are represented as pilot-scoped tasks/risks with custom fields; status and findings are tracked and reported to support go/no-go decisions |
| **3. Post-deployment risk mapping and gap analysis (PIR)** | FR-RSK-03, FR-ISS-01, FR-ISS-02, FR-RAID-01, FR-IAM-06 | Materialised risks convert to issues while retaining the link to the original risk and owner; reconciliation reporting surfaces occurred issues with no prior owned/mitigated risk; the audit trail preserves the full history for review |

## Appendix B — API surface (technical reference)

QUBIT exposes a full REST API (Bearer-token authenticated) documented with OpenAPI 3.0 / Swagger. Principal domains include: authentication and 2FA; users and admin users; departments; IAM (roles, permissions, role assignments); projects; tasks and recurring tasks; comments; custom fields; meetings; documents; decisions; portfolios, programmes and OKRs; resources and allocations; approvals and policies; RAID (risks, issues, change requests); time; finance (budgets, expenses, invoices, purchase orders, vendors, cost centres, fiscal years, FX, forecasts, reports); executive and dashboard; search; notifications and mentions; audit; webhooks; scheduled actions; integrations; and AI (assistant and agent).

---

*Prepared by Riverbank Solutions Limited for KCB Group PLC. This document is a draft business requirements specification for review by the KCB PMO and Architecture Review Board and does not constitute a commercial commitment, legal or compliance attestation. Commercial terms are subject to the agreed Statement of Work.*
