# QUBIT → ClickUp-Class Work Management Platform

This package guides Claude Code through transforming the existing **QUBIT PPM platform** (Next.js 15 App Router · Tailwind 4 · shadcn/ui · Prisma · NextAuth · multi-tenant) into a full ClickUp-style work management system.

## Package contents

| Doc | Purpose |
|---|---|
| `00-README.md` | This file — how to use the package |
| `01-vision-and-scope.md` | What ClickUp does, target feature parity, what QUBIT keeps |
| `02-architecture.md` | System architecture, realtime, background jobs, AI layer |
| `03-data-model.md` | Full Prisma schema additions (hierarchy, tasks, views, docs, chat, automations…) |
| `04-module-specs.md` | Functional spec per module (17 modules) |
| `05-api-spec.md` | REST API design, conventions, endpoint catalogue |
| `06-build-plan.md` | Phased implementation plan with acceptance checks (Claude Code task list) |
| `07-migration-guide.md` | Mapping existing QUBIT PPM concepts → new hierarchy; data migration |
| `08-tickup-reference.md` | What to borrow (and not) from the techmely/tickup reference repo |
| `CLAUDE.md` | Drop into repo root (or merge with existing) — conventions Claude Code must follow |

## How to use with Claude Code

1. Copy this folder into the QUBIT repo as `docs/clickup-transformation/`.
2. Merge `CLAUDE.md` into the repo's root `CLAUDE.md`.
3. Kickoff prompt:

> Read `docs/clickup-transformation/00-README.md`, `07-migration-guide.md`, and `06-build-plan.md`. Then read `03-data-model.md`. Implement **Phase 0** of the build plan (schema foundation + migration scaffolding) and stop for review before continuing. Follow the conventions in `CLAUDE.md`. Do not modify existing PPM tables destructively — all migration steps are additive until Phase 8.

4. Work one phase at a time. Each phase in `06-build-plan.md` is shippable and ends with acceptance checks. Review before moving on.

## Ground rules (repeat to Claude Code often)

- **Additive first.** Existing PPM features keep working until the migration phase.
- **Repo conventions win.** SlidePanel + context pattern, `src/server/*.ts` for server data, `can()` for permission gates, `--brand` CSS-variable theming, tokens only (no raw hex), WCAG AA.
- **Tenant isolation is non-negotiable.** Every query is scoped by `tenantId`. See security notes in `02-architecture.md`.
- **One phase per session.** Keep context small; re-read only the specs the phase needs.
