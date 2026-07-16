# 05 — API Specification

## Conventions

- Base: `/api/v1`. Auth: session (app) or `Authorization: Bearer <ApiToken>` (external, scope-checked).
- Every handler: Zod-validate input (reject unknown keys) → `can()` check → tenant-scoped query → emit `Activity` on mutation → `NOTIFY` realtime.
- Responses: `{ data, meta? }`; errors `{ error: { code, message, fields? } }` with proper status (400 validation, 401, 403, 404 — 404 for cross-tenant, never 403, to avoid existence leaks; 409 conflict/version; 422 domain rule e.g. dependency cycle; 429).
- Pagination: keyset — `?cursor=&limit=` (max 100), `meta.nextCursor`.
- Ids: cuid; tasks also addressable by `seq` (`/tasks/seq/{n}`).
- Rate limits: 100 req/min per token (public API), tighter on public share/form routes.
- Webhook signature: `X-Qubit-Signature: sha256=HMAC(secret, body)`.

## Endpoint catalogue

### Hierarchy
```
GET/POST           /spaces                     GET/PATCH/DELETE /spaces/{id}
GET/POST           /spaces/{id}/folders        GET/PATCH/DELETE /folders/{id}
GET/POST           /spaces/{id}/lists          (folderless)
GET/POST           /folders/{id}/lists         GET/PATCH/DELETE /lists/{id}
POST               /spaces/{id}/duplicate | /folders/{id}/duplicate | /lists/{id}/duplicate
PATCH              /reorder   { objectType, objectId, afterId? }   // fractional orderIndex
GET                /hierarchy // full sidebar tree in one call (spaces→folders→lists, counts)
```

### Statuses & Fields
```
GET/POST /status-groups           PATCH/DELETE /status-groups/{id}   POST /status-groups/{id}/statuses …
GET      /locations/{type}/{id}/fields          // resolved (inherited) definitions
POST     /locations/{type}/{id}/fields          PATCH/DELETE /fields/{id}
```

### Tasks
```
GET    /lists/{id}/tasks?view={viewId}|filters…      // compiled by queryTasks()
POST   /lists/{id}/tasks            GET/PATCH/DELETE /tasks/{id}
POST   /tasks/{id}/duplicate | /tasks/{id}/move { listId }
POST/DELETE /tasks/{id}/assignees/{userId} | /watchers/{userId} | /tags/{tagId}
POST   /tasks/{id}/dependencies { toId, type }   DELETE /dependencies/{id}   // 422 on cycle
GET/POST /tasks/{id}/checklists … items …
GET/POST /tasks/{id}/comments      PATCH/DELETE /comments/{id}   POST /comments/{id}/resolve
GET    /tasks/{id}/activity
PUT    /tasks/{id}/fields/{fieldId} { value }
POST   /attachments/presign { ownerType, ownerId, fileName, mimeType, sizeBytes } → { uploadUrl, storageKey }
POST   /attachments/confirm
```

### Views
```
GET/POST /locations/{type}/{id}/views     GET/PATCH/DELETE /views/{id}
POST /views/{id}/share  → { shareToken }   DELETE /views/{id}/share
GET  /public/views/{shareToken}            // stripped payload, rate-limited
```

### Docs / Chat / Whiteboards
```
GET/POST /docs        GET/PATCH/DELETE /docs/{id}      pages: GET/POST /docs/{id}/pages, PATCH/DELETE /pages/{id}
PUT  /pages/{id}/content { content, baseVersion } → 409 on conflict
GET/POST /channels    GET /channels/{id}/messages?cursor    POST /channels/{id}/messages
PATCH/DELETE /messages/{id}    POST /messages/{id}/reactions { emoji }    POST /messages/{id}/create-task { listId }
GET/POST /whiteboards  GET/PATCH /whiteboards/{id}   PUT /whiteboards/{id}/content { content, version } → 409
```

### Inbox / Automations / Dashboards / Goals / Sprints / Time / Forms
```
GET   /inbox?tab=important|other      POST /notifications/{id}/read | /snooze { until }   POST /inbox/read-all
GET/POST /locations/{type}/{id}/automations   PATCH/DELETE /automations/{id}   GET /automations/{id}/runs
POST  /automations/draft { description } → { trigger, conditions, actions }    // Q natural-language draft
GET/POST /dashboards … /dashboards/{id}/widgets …    GET /widgets/{id}/data    // server-computed widget payload
GET/POST /goals … /goals/{id}/targets …   PATCH /targets/{id}/current
GET/POST /spaces/{id}/sprints   POST /sprints/{id}/start | /complete { rolloverTo }
GET   /sprints/{id}/burndown | /velocity
POST  /time/start { taskId }   POST /time/stop   GET/POST /tasks/{id}/time   GET /time/report?userIds&from&to
GET/POST /lists/{id}/forms   PATCH /forms/{id}   GET /public/forms/{shareToken}   POST /public/forms/{shareToken}/submit
```

### Search, Q, Events, Admin
```
GET  /search?q=&types=task,doc,chat&locationId=      // FTS, permission-filtered
POST /q/chat { messages, context: { taskId?|listId?|docId? } }        // streams SSE
POST /q/summarize { objectType, objectId }           POST /q/standup { from, to }
GET  /events?topics=list:{id},inbox:user:{id}        // SSE stream
GET/POST /api-tokens    DELETE /api-tokens/{id}
GET/POST /webhooks      PATCH/DELETE /webhooks/{id}  GET /webhooks/{id}/deliveries
```

## Realtime topics

`space:{id}` (tree changes) · `list:{id}` (task CRUD in list) · `task:{id}` (panel open) · `chat:{channelId}` · `doc:{id}` · `whiteboard:{id}` · `inbox:user:{id}` · `dashboard:{id}`. Event payload: `{ topic, verb, objectId, actorId, at }` — clients refetch via TanStack Query invalidation; no data in events (permission safety).

## Domain events (automation/webhook allowlist)

`task.created|updated|status_changed|assignee_changed|due_soon|moved|deleted` · `comment.added|resolved` · `checklist.completed` · `form.submitted` · `doc.updated` · `message.posted` · `sprint.started|completed` · `time.logged` · `goal.updated`
