# 02 — Architecture

## Stack (unchanged core, new capabilities)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 App Router, React Server Components + client islands | Existing |
| UI | Tailwind 4 + shadcn/ui, token-based theming (`--q*` vars, per-tenant `--brand`) | Existing — tokens only, no raw hex |
| State | TanStack Query (server cache) + small client contexts (drawer/panel pattern) | Existing pattern |
| API | Next.js Route Handlers under `/api/v1/*` | New versioned namespace; existing `/api/*` stays until migration |
| DB | PostgreSQL 16 + Prisma | Existing |
| Auth | NextAuth (email→tenant resolution, optional TOTP) | Existing |
| Realtime | **Postgres LISTEN/NOTIFY → Server-Sent Events (SSE)** via `/api/v1/events` | New — see below |
| Background jobs | **pg-boss** (Postgres-backed queue) | New — automations, recurring tasks, notifications, AI jobs |
| Search | Postgres full-text (tsvector) + pg_trgm; one `SearchIndex` table | New — powers global search & Q connected search |
| AI | Provider-agnostic `src/server/ai/provider.ts` (Anthropic default), all calls server-side | Extends existing `/api/q/chat` |
| Files | S3-compatible object storage (env-configured), presigned uploads | New `Attachment` model |

Why no separate services: Postgres does queue (pg-boss), realtime fan-out (LISTEN/NOTIFY), and search (FTS) well at this scale. One database, one deployment, fewer failure modes. Swap points are isolated behind `src/server/queue.ts`, `src/server/realtime.ts`, `src/server/search.ts` if scale later demands Redis/Elastic/websocket infra.

## Directory layout (additions)

```
src/
  app/(app)/
    [spaceId]/            # Space home + settings
      [containerId]/      # Folder or List location pages
        v/[viewId]/       # Saved views (list|board|calendar|gantt|table|timeline|workload)
    docs/ chat/ whiteboards/ dashboards/ goals/ inbox/ home/
  server/
    hierarchy.ts tasks.ts views.ts fields.ts docs.ts chat.ts
    automations/ (engine.ts triggers.ts actions.ts)
    ai/ (provider.ts rank.ts summarize.ts agents.ts search.ts)
    queue.ts realtime.ts search.ts permissions.ts
  components/
    views/ (ListView, BoardView, CalendarView, GanttView, TableView, TimelineView, WorkloadView)
    task/ (TaskPanel — the slide-in task detail, reusing SlidePanel pattern)
    fields/ (one component per custom-field type)
    editor/ (TipTap-based block editor, shared by Docs, task descriptions, comments, chat)
```

## Key decisions

### 1. Location pattern
Spaces, Folders, and Lists are "locations". Docs, chats, whiteboards, dashboards and views all carry an optional polymorphic location (`locationType` + `locationId`). One pattern, every module.

### 2. Views engine
A `View` = `{ type, location, filters[], groupBy, sortBy[], visibleFields[], settings }` persisted as typed JSON (Zod-validated). All view types share one server-side task query builder (`src/server/views.ts::queryTasks(view)`) that compiles filters → Prisma where-clauses. View components are pure renderers over the same normalized task page.

### 3. Block editor everywhere
One TipTap editor with a shared extension set (headings, lists, tables, code, mentions `@user`, task links, embeds, slash commands). Docs = pages of this editor; task descriptions, comments and chat messages are the same editor with reduced extension sets. Content stored as TipTap JSON in `jsonb`.

### 4. Realtime
Mutations write to DB, then `NOTIFY qubit_events, '{tenantId, topic, payload}'`. `/api/v1/events?topics=...` holds an SSE connection per client, filtered by tenant + subscribed topics (e.g. `list:123`, `chat:45`, `inbox:user:9`). Client invalidates TanStack Query keys on events. Optimistic updates for drag-drop, status changes, chat send.

### 5. Automations engine
Event bus: every mutation emits a domain event (`task.status_changed`, `task.created`, `comment.added`, …) into pg-boss. The automation worker loads active `Automation` rows matching (tenant, location, trigger), evaluates conditions against the event payload, executes actions (which themselves emit events — loop-guarded by an `automationDepth` counter, max 3).

### 6. AI (Q Brain)
All AI server-side. Capabilities: connected search (FTS retrieval → rerank → answer with citations), summarize (task threads, docs, chat channels, standups), AI custom fields (computed on demand + cached, invalidated on task change), autopilot agents (automation action type `ai.agent` with a scoped toolset: read tasks, comment, set fields — never delete), and the existing My Tasks ranking. Prompt templates in `src/server/ai/prompts/`. Log every AI call (`AiCallLog`: tokens, latency, purpose) for cost control.

## Security (regulated-data posture)

- **Tenant isolation**: every Prisma query goes through scoped helpers (`forTenant(tx, tenantId)`); integration tests assert cross-tenant reads fail. Add a CI test that greps for raw `prisma.task.findMany` outside `src/server/`.
- **Permissions**: `can(user, action, resource)` extended with hierarchy inheritance and per-object overrides (see `04-module-specs.md` §16). Checked server-side in every route handler — UI gating is cosmetic only.
- **Public surfaces** (forms, shared views/docs): separate unauthenticated routes, token-based (`shareToken`, revocable), rate-limited, no PII beyond what the creator exposed; uploads virus-scan hook + type/size allowlist.
- **Input validation**: Zod schema per endpoint; reject unknown keys. All list filters compiled server-side (never interpolate into SQL).
- **Secrets** via env only; webhook signing (HMAC-SHA256, per-endpoint secret); audit log (`AuditLog`) for admin, permission, automation-definition and export events.
- **Attachments**: presigned S3 URLs, private bucket, short-lived GETs; never proxy raw user HTML.
- **AI**: tenant-scoped retrieval only; strip credentials/secrets patterns from AI context; no user content in logs beyond IDs.
