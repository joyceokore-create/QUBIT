import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { decryptSecret } from "@/lib/secret-box";
import {
  YoutrackError,
  fetchIssues,
  mapIssue,
  type MappedIssue,
  type YoutrackFieldMap,
} from "@/server/connectors/youtrack";

/**
 * YouTrack → QUBIT issue sync (BRD FR-INT-05). Mirrors issues onto ProjectTask so every
 * existing surface — board, project progress, member weekly reports, QA queues,
 * requirement coverage — reads the delivery teams' real work without a second reporting
 * path. See DECISIONS DM1.42 for why mirroring beats a parallel table.
 *
 * Properties this file is responsible for:
 *  - IDEMPOTENT. The upsert key is (projectId, sourceSystem, externalId); re-running a
 *    sync over the same issues changes nothing and writes no audit rows.
 *  - SHORT TRANSACTIONS. The network call happens outside any transaction, and writes go
 *    in chunks, so a 5,000-issue project never holds one connection for the whole sync.
 *  - HONEST AUDIT. A row per created task, a row per task whose owned fields actually
 *    changed, and one summary row per run. A no-op sync writes none.
 *  - NO PHANTOM USERS. An assignee is matched to a QUBIT user by email inside the tenant;
 *    an unmatched one is kept as a display name only.
 */

/** The sync runs for a signed-in user (manual) or the machine actor (job); neither path
 *  needs roles, so the narrow shape keeps the job runtime honest. */
export type SyncContext = Pick<TenantContext, "tenantId" | "userId">;

export const SOURCE_SYSTEM = "youtrack";
const WRITE_CHUNK = 100;

/** Non-secret per-project settings held in ProjectIntegration.config. */
export interface YoutrackConfig {
  baseUrl: string;
  fieldMap?: YoutrackFieldMap;
}

export interface SyncResult {
  projectId: string;
  projectCode: string;
  created: number;
  updated: number;
  unchanged: number;
  /** Issues the mapper refused (no id) — reported rather than silently dropped. */
  skipped: number;
  /** YouTrack assignee names with no matching QUBIT user, so the gap is visible. */
  unmatchedAssignees: string[];
  /** True when the page ceiling was hit; the next run picks up the rest. */
  truncated: boolean;
}

export class SyncError extends Error {
  constructor(
    message: string,
    public code: "NOT_CONNECTED" | "BAD_CONFIG" | "AUTH" | "UNAVAILABLE",
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/** Parse the stored config defensively — it is JSON a human edited through the panel. */
export function parseConfig(raw: unknown): YoutrackConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const baseUrl = typeof c.baseUrl === "string" ? c.baseUrl.trim() : "";
  if (!baseUrl) return null;
  const fm = c.fieldMap;
  const pick = (k: string): Record<string, string> | undefined => {
    const v = (fm as Record<string, unknown> | undefined)?.[k];
    if (!v || typeof v !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[key.toLowerCase()] = val;
    }
    return Object.keys(out).length ? out : undefined;
  };
  return {
    baseUrl,
    fieldMap: { state: pick("state"), type: pick("type"), priority: pick("priority") },
  };
}

/** The fields YouTrack owns. Local edits to these are refused (see project-tasks.ts) and
 *  a sync only writes when one of them genuinely differs. */
const OWNED_FIELDS = [
  "title",
  "description",
  "status",
  "type",
  "priority",
  "severity",
  "dueDate",
  "assigneeId",
  "externalAssigneeName",
  "externalKey",
  "externalUrl",
] as const;

interface ExistingTask {
  id: string;
  externalId: string | null;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  severity: string | null;
  dueDate: Date | null;
  assigneeId: string | null;
  externalAssigneeName: string | null;
  externalKey: string | null;
  externalUrl: string | null;
}

type OwnedValues = Pick<ExistingTask, (typeof OWNED_FIELDS)[number]>;

function ownedValues(issue: MappedIssue, assigneeId: string | null): OwnedValues {
  return {
    title: issue.title,
    description: issue.description,
    status: issue.status,
    type: issue.type,
    priority: issue.priority,
    severity: issue.severity,
    dueDate: issue.dueDate,
    // A matched QUBIT user wins; the display name is kept only when nobody matched, so the
    // card never shows both.
    assigneeId,
    externalAssigneeName: assigneeId ? null : issue.assigneeName,
    externalKey: issue.externalKey,
    externalUrl: issue.externalUrl,
  };
}

/** Which owned fields differ — empty means the sync has nothing to write for this row. */
export function changedFields(before: OwnedValues, after: OwnedValues): string[] {
  return OWNED_FIELDS.filter((f) => {
    const a = before[f];
    const b = after[f];
    if (a instanceof Date || b instanceof Date) {
      return (a instanceof Date ? a.getTime() : null) !== (b instanceof Date ? b.getTime() : null);
    }
    return (a ?? null) !== (b ?? null);
  });
}

/** Read the integration config and decrypt the token. Throws SyncError, never leaks it. */
async function loadConnection(ctx: SyncContext, projectId: string) {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } });
    if (!project) throw new SyncError("Project not found.", "NOT_CONNECTED");
    const row = await tx.projectIntegration.findUnique({
      where: { projectId_provider: { projectId, provider: SOURCE_SYSTEM } },
      select: { connected: true, resource: true, secret: true, config: true, lastSyncAt: true },
    });
    if (!row?.connected) throw new SyncError("YouTrack is not connected on this project.", "NOT_CONNECTED");
    if (!row.resource) throw new SyncError("Set the YouTrack project short name first.", "BAD_CONFIG");
    if (!row.secret) throw new SyncError("Add a YouTrack token first.", "BAD_CONFIG");
    const config = parseConfig(row.config);
    if (!config) throw new SyncError("Set the YouTrack instance URL first.", "BAD_CONFIG");
    let token: string;
    try {
      token = decryptSecret(row.secret);
    } catch {
      throw new SyncError("Stored YouTrack token could not be read — re-enter it.", "BAD_CONFIG");
    }
    return { project, resource: row.resource, token, config, lastSyncAt: row.lastSyncAt };
  });
}

/** Record the outcome so a silently dead integration is visible in the panel. */
async function stampSync(ctx: SyncContext, projectId: string, error: string | null, at: Date) {
  await withTenant(ctx, (tx) =>
    tx.projectIntegration.updateMany({
      where: { projectId, provider: SOURCE_SYSTEM },
      // lastSyncAt advances only on success: a failed run must re-fetch the same window
      // next time rather than skipping past issues it never saw.
      data: error ? { lastSyncError: error } : { lastSyncAt: at, lastSyncError: null },
    }),
  );
}

/**
 * Sync one project. `full` ignores the incremental watermark and re-reads everything —
 * used after a mapping change, when previously-synced issues need re-evaluating.
 */
export async function syncProject(
  ctx: SyncContext,
  projectId: string,
  opts: { full?: boolean } = {},
): Promise<SyncResult> {
  const conn = await loadConnection(ctx, projectId);
  const startedAt = new Date();

  // ── Network, deliberately outside every transaction ──
  let fetched;
  try {
    fetched = await fetchIssues({
      baseUrl: conn.config.baseUrl,
      token: conn.token,
      project: conn.resource,
      updatedAfter: opts.full ? null : conn.lastSyncAt,
    });
  } catch (e) {
    const err = e instanceof YoutrackError ? e : null;
    const message = err?.message ?? "YouTrack sync failed.";
    await stampSync(ctx, projectId, message, startedAt);
    throw new SyncError(message, err?.code === "AUTH" ? "AUTH" : err?.code === "BAD_CONFIG" || err?.code === "BLOCKED_HOST" ? "BAD_CONFIG" : "UNAVAILABLE");
  }

  const mapped: MappedIssue[] = [];
  let skipped = 0;
  for (const raw of fetched.issues) {
    const m = mapIssue(raw, conn.config.baseUrl, conn.config.fieldMap ?? {});
    if (m) mapped.push(m);
    else skipped++;
  }

  const result: SyncResult = {
    projectId,
    projectCode: conn.project.code,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped,
    unmatchedAssignees: [],
    truncated: fetched.truncated,
  };
  if (!mapped.length) {
    await stampSync(ctx, projectId, null, startedAt);
    return result;
  }

  // Resolve people once. RLS scopes this to the tenant, so a YouTrack account whose email
  // belongs to a user in ANOTHER tenant simply does not match — it cannot cross over.
  const emails = [
    ...new Set(mapped.flatMap((m) => [m.assigneeEmail, m.reporterEmail]).filter((e): e is string => !!e)),
  ];
  const userByEmail = await withTenant(ctx, async (tx) => {
    if (!emails.length) return new Map<string, string>();
    const users = await tx.user.findMany({
      where: { email: { in: emails, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true, email: true },
    });
    return new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  });
  const unmatched = new Set<string>();

  // ── Writes, chunked so no single transaction spans the whole project ──
  for (let i = 0; i < mapped.length; i += WRITE_CHUNK) {
    const chunk = mapped.slice(i, i + WRITE_CHUNK);
    await withTenant(ctx, async (tx) => {
      const existing = (await tx.projectTask.findMany({
        where: { projectId, sourceSystem: SOURCE_SYSTEM, externalId: { in: chunk.map((m) => m.externalId) } },
        select: {
          id: true, externalId: true, title: true, description: true, status: true, type: true,
          priority: true, severity: true, dueDate: true, assigneeId: true,
          externalAssigneeName: true, externalKey: true, externalUrl: true,
        },
      })) as ExistingTask[];
      const byExternalId = new Map(existing.map((t) => [t.externalId, t]));

      for (const issue of chunk) {
        const assigneeId = issue.assigneeEmail ? (userByEmail.get(issue.assigneeEmail) ?? null) : null;
        if (issue.assigneeEmail && !assigneeId && issue.assigneeName) unmatched.add(issue.assigneeName);
        const next = ownedValues(issue, assigneeId);
        const prior = byExternalId.get(issue.externalId);

        if (!prior) {
          const created = await tx.projectTask.create({
            data: {
              tenantId: ctx.tenantId,
              projectId,
              sourceSystem: SOURCE_SYSTEM,
              externalId: issue.externalId,
              externalSyncedAt: startedAt,
              // Mirrored issues are live work, never drafts, and carry no QUBIT taskKey —
              // that key space belongs to commit automation (see the schema comment).
              approvalStatus: "Published",
              reporterId: issue.reporterEmail ? (userByEmail.get(issue.reporterEmail) ?? null) : null,
              lastActivityAt: issue.updatedAt ?? startedAt,
              ...next,
            },
            select: { id: true },
          });
          await audit(tx, ctx, {
            action: "create",
            entityType: "project_task",
            entityId: created.id,
            after: { sourceSystem: SOURCE_SYSTEM, ...next },
          });
          result.created++;
          continue;
        }

        const changed = changedFields(prior, next);
        if (!changed.length) {
          // Still stamp the sync time — "we looked and it was current" is useful, and a
          // bare timestamp write needs no audit row.
          await tx.projectTask.update({ where: { id: prior.id }, data: { externalSyncedAt: startedAt } });
          result.unchanged++;
          continue;
        }
        await tx.projectTask.update({
          where: { id: prior.id },
          data: { ...next, externalSyncedAt: startedAt, lastActivityAt: issue.updatedAt ?? startedAt },
        });
        await audit(tx, ctx, {
          action: "update",
          entityType: "project_task",
          entityId: prior.id,
          before: Object.fromEntries(changed.map((f) => [f, prior[f as keyof OwnedValues]])),
          after: Object.fromEntries(changed.map((f) => [f, next[f as keyof OwnedValues]])),
        });
        result.updated++;
      }
    });
  }

  result.unmatchedAssignees = [...unmatched].sort();
  await withTenant(ctx, (tx) =>
    audit(tx, ctx, {
      action: "update",
      entityType: "project_integration",
      entityId: `${projectId}:${SOURCE_SYSTEM}`,
      after: {
        sync: "youtrack",
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped,
        truncated: result.truncated,
        unmatchedAssignees: result.unmatchedAssignees.length,
      },
    }),
  );
  await stampSync(ctx, projectId, null, startedAt);
  return result;
}

/** Projects in the current tenant with YouTrack connected and a token stored. */
export async function connectedProjectIds(ctx: SyncContext): Promise<string[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectIntegration.findMany({
      where: { provider: SOURCE_SYSTEM, connected: true, secret: { not: null }, resource: { not: null } },
      select: { projectId: true },
      orderBy: { projectId: "asc" },
    });
    return rows.map((r) => r.projectId);
  });
}

/** Is this project mirrored from YouTrack? Gates native task creation and local edits. */
export async function isYoutrackConnected(ctx: SyncContext, projectId: string): Promise<boolean> {
  const row = await withTenant(ctx, (tx) =>
    tx.projectIntegration.findUnique({
      where: { projectId_provider: { projectId, provider: SOURCE_SYSTEM } },
      select: { connected: true },
    }),
  );
  return Boolean(row?.connected);
}
