# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Riverbank Group's internal delivery organisation. **Project managers are the primary
users** (confirmed 2026-07-20): when design trade-offs bite, the PM running delivery
wins. Developers, QA engineers, heads of projects/QA, and executives are first-class
secondary audiences with role-specific surfaces (board lenses, My Tasks, reports,
admin). Users are technically literate staff working at desks, usually on desktop
browsers, often across many projects at once.

## Product Purpose

QUBIT is Riverbank Group's enterprise PPM (Portfolio & Programme Management) platform:
one command centre for portfolios, programmes and projects, the day-to-day delivery
work cycle (kanban boards with task keys, blockers, join requests, notifications), and
reporting — with Q, an embedded AI copilot grounded in the tenant's live data. Success
means delivery status is visible without chasing people, and acting on a task (create,
assign, move, flag blocked, report) is seamless from anywhere it appears.

## Positioning

An internal tool, not a product for sale (confirmed 2026-07-20 — the second tenant is a
synthetic fixture for isolation tests only, never a customer). Its distinguishing
mechanism inside Riverbank: database-enforced tenant isolation (Postgres RLS on every
table), **derived-never-manual metrics** (progress, blocked counts, milestone status all
computed from task truth), a full audit trail on every mutation, and a grounded AI
copilot that only speaks from tenant data.

## Operating Context

- Deployed at https://q.fikrawork.com (Docker Compose on an internal box); used in the
  browser during the working day.
- Delivery workflow: PM creates a project (PM lead is mandatory), team joins via
  requests, BRDs are uploaded or AI-drafted, AI-generated task plans land as Drafts that
  only the PM publishes, developers and QA work board lenses, weekly reports go to
  managers and executives.
- GitHub hosts the code being delivered; commit-driven task automation is planned
  (docs/15, milestone 6.3).
- The docs pack (`docs/00-index.md` … `docs/15-…`) and `DECISIONS.md` govern scope and
  record decisions; work ships one milestone at a time.

## Capabilities and Constraints

- Multitenancy is mandatory on every data path (RLS; see docs/04). Every mutation is
  audited. No real or realistic PII anywhere, including seeds and fixtures.
- Stack is fixed (CLAUDE.md): Next.js 15 App Router, React 19, TypeScript strict,
  Tailwind 4, shadcn/ui + Radix, Postgres 17 + Prisma, Auth.js, Zod, Recharts.
- Terminology: portfolios → programmes → projects; project tasks carry a key
  ("RBS-01-5"), a type (Feature/Bug/Chore/Spike/Improvement) and one of five statuses;
  "blocked" is a flag backed by a Blocker record, never a status; AI plans are
  Draft→Published; boards are one task list viewed through Dev/QA/All lenses plus a
  viewer-controlled "Mine" filter (a filter, never a wall — global read, scoped write).
- Project codes are auto-generated from names (unique per tenant); progress is always
  derived from tasks.

## Brand Commitments

- Theming is per-tenant data: Riverbank red `#ED1C24`; the product-default green covers
  pre-auth surfaces and any non-Riverbank tenant. Both must keep working.
- Type (QUBIT App v3, from code): product faces are Archivo (headings/wordmark),
  Instrument Sans (body), IBM Plex Mono (labels/codes/metrics); the Riverbank tenant
  swaps to Plus Jakarta Sans + Inter via font-indirection tokens. All via next/font.
- The design system in `docs/08-design-system.md` (tokens, spacing, components) is
  binding; components come from shadcn/ui + Radix.
- Voice: clear, professional, plain English (org standard); no invented claims.

## Evidence on Hand

- `docs/` pack: PRD (01), architecture (02), data model (05), design system (08), UI
  spec (09), Phase 6 delivery-workflow plan (15).
- `QUBIT_Business_Requirements_Document.md` at the repo root.
- Seed data is deliberately synthetic (`*.example.invalid`, generic role placeholders);
  there are **no real testimonials, customers, or benchmarks** — future surfaces must
  not fabricate any.

## Product Principles

1. **Tenant isolation is non-negotiable** — every read and write proves its tenant.
2. **Metrics are derived, never manual** — the board is the source of truth; numbers
   that can drift from it don't ship.
3. **Global read, scoped write; filters, not walls** — everyone sees the shared
   picture, focus comes from viewer-controlled filters, authority comes from roles.
4. **Every mutation leaves an audit row** — machine actors included.
5. **The PM's path is the shortest** — when surfaces compete, the person running
   delivery gets the fewest clicks from signal to action.

## Accessibility & Inclusion

WCAG 2.1 AA is the target standard (confirmed 2026-07-20). Future design and build work
treats AA as a requirement, not an aspiration.
