# 03 — Data Model (Prisma additions)

All models get `tenantId String @index` + relation to `Tenant`, `createdAt`, `updatedAt` unless noted. Soft delete via `deletedAt DateTime?` on user-facing content models. Existing PPM models (Portfolio, Programme, Project, legacy Task, OrgUnit, Department, User, Tenant) are untouched until Phase 8.

## Hierarchy

```prisma
model Space {
  id          String  @id @default(cuid())
  tenantId    String
  name        String
  icon        String? // emoji or token key
  color       String? // token key, not raw hex
  isPrivate   Boolean @default(false)
  archived    Boolean @default(false)
  orderIndex  Float   // fractional ordering everywhere
  settings    Json    // ClickApps toggles: { sprints, timeTracking, points, dependencies, customFields, ... }
  folders     Folder[]
  lists       List[]  // folderless lists
  statuses    StatusGroup[]
}

model Folder {
  id         String  @id @default(cuid())
  tenantId   String
  spaceId    String
  parentId   String? // subfolders
  name       String
  archived   Boolean @default(false)
  orderIndex Float
  lists      List[]
}

model List {
  id            String  @id @default(cuid())
  tenantId      String
  spaceId       String
  folderId      String? // null = folderless
  name          String
  description   Json?   // editor JSON
  archived      Boolean @default(false)
  orderIndex    Float
  statusGroupId String? // null = inherit from folder/space
  defaultAssigneeId String?
  startDate     DateTime?
  dueDate       DateTime?
  priority      Int?    // list-level info fields
  tasks         Task[]
}
```

## Statuses & Tasks

```prisma
model StatusGroup { // a reusable set of statuses; attached at space/folder/list level
  id       String @id @default(cuid())
  tenantId String
  name     String
  statuses Status[]
}

model Status {
  id            String @id @default(cuid())
  statusGroupId String
  name          String
  colorToken    String  // semantic token (RAG palette stays semantic)
  type          StatusType // OPEN | ACTIVE | DONE | CLOSED
  orderIndex    Float
}

model Task {
  id           String   @id @default(cuid())
  tenantId     String
  listId       String
  parentId     String?  // subtask (unlimited nesting; UI caps display at 3)
  name         String
  description  Json?    // editor JSON
  statusId     String
  priority     Priority? // URGENT | HIGH | NORMAL | LOW
  startDate    DateTime?
  dueDate      DateTime?
  isMilestone  Boolean  @default(false)
  timeEstimate Int?     // minutes
  sprintPoints Float?
  orderIndex   Float
  archived     Boolean  @default(false)
  deletedAt    DateTime?
  createdById  String
  seq          Int      // per-tenant human ID → "QBT-1042"
  assignees    TaskAssignee[]   // multi-assignee
  watchers     TaskWatcher[]
  tags         TaskTag[]
  checklists   Checklist[]
  comments     Comment[]
  fieldValues  FieldValue[]
  dependencies TaskDependency[] @relation("from")
  dependents   TaskDependency[] @relation("to")
  attachments  Attachment[]
  recurrence   Json?    // RRULE + behavior (onComplete|onSchedule)
  @@index([tenantId, listId, statusId])
  @@index([tenantId, dueDate])
  @@unique([tenantId, seq])
}

model TaskDependency {
  id       String @id @default(cuid())
  tenantId String
  fromId   String // blocking task
  toId     String // waiting task
  type     DependencyType // BLOCKS | WAITING_ON | LINKED
  @@unique([fromId, toId, type])
}

model Checklist { id, tenantId, taskId, name, orderIndex; items ChecklistItem[] }
model ChecklistItem { id, checklistId, name, done Boolean, assigneeId String?, orderIndex }
model Tag { id, tenantId, spaceId, name, colorToken; @@unique([spaceId, name]) }
model TaskTag { taskId, tagId @@id([taskId, tagId]) }
model TaskAssignee { taskId, userId @@id([taskId, userId]) }
model TaskWatcher { taskId, userId @@id([taskId, userId]) }
```

## Custom fields

```prisma
model FieldDefinition {
  id           String    @id @default(cuid())
  tenantId     String
  locationType LocationType // SPACE | FOLDER | LIST — inherited downward
  locationId   String
  name         String
  type         FieldType
  config       Json      // options for dropdown/labels, currency code, formula, ai prompt, etc.
  required     Boolean   @default(false)
  orderIndex   Float
}
enum FieldType {
  TEXT LONG_TEXT NUMBER MONEY DATE DROPDOWN LABELS CHECKBOX URL EMAIL PHONE
  PEOPLE RATING PROGRESS_AUTO PROGRESS_MANUAL FORMULA RELATIONSHIP FILES AI
}

model FieldValue {
  id       String @id @default(cuid())
  tenantId String
  taskId   String
  fieldId  String
  value    Json   // typed by FieldType, Zod-validated server-side
  @@unique([taskId, fieldId])
}
```

## Views

```prisma
model View {
  id           String   @id @default(cuid())
  tenantId     String
  locationType LocationType // SPACE | FOLDER | LIST | EVERYTHING | USER(home)
  locationId   String?
  type         ViewType // LIST | BOARD | CALENDAR | GANTT | TABLE | TIMELINE | WORKLOAD | MINDMAP
  name         String
  isDefault    Boolean  @default(false)
  isPinned     Boolean  @default(false)
  createdById  String
  config       Json     // { filters[], groupBy, sortBy[], visibleFieldIds[], colStatuses?, meMode?, settings }
  shareToken   String?  @unique // public sharing
}
```

## Docs, Chat, Whiteboards

```prisma
model Doc {
  id           String @id @default(cuid())
  tenantId     String
  locationType LocationType?  // optional attachment to hierarchy
  locationId   String?
  title        String
  icon         String?
  createdById  String
  shareToken   String? @unique
  pages        DocPage[]
}
model DocPage {
  id        String  @id @default(cuid())
  docId     String
  parentId  String? // nested pages
  title     String
  content   Json    // TipTap JSON
  orderIndex Float
  updatedById String
}

model Channel {
  id           String @id @default(cuid())
  tenantId     String
  kind         ChannelKind // CHANNEL | DM | TASK_THREAD | LOCATION (auto per space/folder/list)
  name         String?
  locationType LocationType?
  locationId   String?
  isPrivate    Boolean @default(false)
  members      ChannelMember[]
  messages     Message[]
}
model Message {
  id        String  @id @default(cuid())
  tenantId  String
  channelId String
  authorId  String
  parentId  String? // thread reply
  content   Json    // editor JSON (mentions, task links)
  reactions Json    // { "👍": [userId,…] }
  createdTaskId String? // "convert to task" backlink
  editedAt  DateTime?
  deletedAt DateTime?
}

model Whiteboard {
  id           String @id @default(cuid())
  tenantId     String
  locationType LocationType?
  locationId   String?
  name         String
  content      Json   // scene graph: nodes (shape|sticky|text|taskCard|connector|image), edges
  updatedById  String
  version      Int    // optimistic concurrency (last-write-wins with version check)
}
```

## Comments, Attachments, Activity, Notifications

```prisma
model Comment {
  id         String  @id @default(cuid())
  tenantId   String
  taskId     String
  authorId   String
  parentId   String? // threaded
  content    Json
  assignedToId String? // "assigned comment" — resolvable action item
  resolvedAt DateTime?
  reactions  Json
}

model Attachment { id, tenantId, ownerType String, ownerId String, fileName, mimeType, sizeBytes Int, storageKey, uploadedById }

model Activity { // immutable event log per object — feeds task activity tab, automations, audit
  id        String @id @default(cuid())
  tenantId  String
  actorId   String? // null = system/automation/Q
  objectType String
  objectId  String
  verb      String  // task.status_changed, comment.added, ...
  data      Json
  createdAt DateTime @default(now())
  @@index([tenantId, objectType, objectId, createdAt])
}

model Notification {
  id        String  @id @default(cuid())
  tenantId  String
  userId    String
  activityId String
  reason    String  // assigned | mention | watcher | due_soon | automation | q_nudge
  readAt    DateTime?
  snoozedUntil DateTime?
  @@index([tenantId, userId, readAt])
}
```

## Automations, Dashboards, Goals, Sprints, Forms, Time

```prisma
model Automation {
  id           String  @id @default(cuid())
  tenantId     String
  locationType LocationType
  locationId   String
  name         String
  active       Boolean @default(true)
  trigger      Json    // { type: "task.status_changed", params: { to: [statusId] } }
  conditions   Json    // [{ field, op, value }] — AND groups of OR rows
  actions      Json    // ordered [{ type: "task.set_assignee", params }, { type: "ai.agent", params }]
  runCount     Int     @default(0)
  createdById  String
}
model AutomationRun { id, automationId, tenantId, triggerActivityId, status RunStatus, log Json, startedAt, finishedAt }

model Dashboard { id, tenantId, name, locationType?, locationId?, createdById, isPrivate, shareToken? }
model Widget { id, dashboardId, tenantId, type WidgetType, // TASK_LIST | BAR | PIE | LINE | BATTERY | NUMBER | CALCULATION | TIME_REPORT | WORKLOAD | SPRINT_BURNDOWN | SPRINT_VELOCITY | GOAL | TEXT | EMBED
  config Json, x Int, y Int, w Int, h Int }

model Goal { id, tenantId, name, description?, ownerId, dueDate?, folderName?, color }
model Target { id, goalId, tenantId, name, type TargetType, // NUMBER | MONEY | TRUE_FALSE | TASK — task targets track linked tasks' completion
  start Json, end Json, current Json, linkedTaskIds String[] }

model Sprint { id, tenantId, spaceId, name, startDate, endDate, goalText?, status SprintStatus } // tasks link via existing listId — a Sprint IS a special List (sprintId on List)

model Form { id, tenantId, listId, name, fields Json, // ordered form fields → task name/description/custom fields
  shareToken String @unique, active Boolean, submitCount Int, settings Json /* captcha, confirmation msg */ }

model TimeEntry {
  id        String  @id @default(cuid())
  tenantId  String
  taskId    String
  userId    String
  start     DateTime
  end       DateTime? // null = running timer (one running per user, enforced)
  durationMin Int?    // derived on stop; manual entries set directly
  note      String?
  billable  Boolean @default(false)
  @@index([tenantId, userId, start])
}
```

## Permissions, Search, AI, API

```prisma
model PermissionOverride { id, tenantId, objectType, objectId, subjectType /* USER|ROLE */, subjectId, level PermLevel } // FULL | EDIT | COMMENT | VIEW — see 04 §16
model SearchIndex { id, tenantId, objectType, objectId, title, body /* extracted text */, tsv Unsupported("tsvector"), updatedAt } // maintained by queue worker
model AiCallLog { id, tenantId, userId?, purpose, model, inputTokens, outputTokens, latencyMs, createdAt }
model ApiToken { id, tenantId, userId, name, hashedToken, scopes String[], lastUsedAt, expiresAt? }
model Webhook { id, tenantId, url, secret, events String[], active, failCount }
```

## Conventions

- **Ordering**: `orderIndex Float` with fractional insertion (midpoint); re-normalize in a job when gaps < 1e-6.
- **Location polymorphism**: `(locationType, locationId)` pairs validated in `src/server/hierarchy.ts::resolveLocation()` — single helper, everywhere.
- **Inheritance resolution** (statuses, fields, permissions, ClickApps): List → Folder → Space → defaults; resolved server-side by one memoized helper per request.
- **Migrations**: additive only until Phase 8; every migration reversible; seed script extended per phase.
