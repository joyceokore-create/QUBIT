import "server-only";
import { z } from "zod";
import { flagEnabled } from "@/lib/flags";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { setIntegration, type SetIntegrationInput } from "@/server/integrations";
import { parseConfig, SyncError, syncProject } from "@/server/connectors/youtrack-sync";

/**
 * Admin › Integrations — connect YouTrack for many projects at once: one instance URL and
 * one token entered by an admin, a YouTrack project key per QUBIT project. Each row goes
 * through the same `setIntegration` the per-project card uses (token encrypted, audit row,
 * sync watermark reset), then — when asked — a full `syncProject`, which is the only real
 * proof that URL + token + key work: YouTrack's answer comes back per row. Nothing aborts
 * the batch; the token never appears in a response.
 */

export class YoutrackBulkError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "DISABLED",
  ) {
    super(message);
    this.name = "YoutrackBulkError";
  }
}

export interface YoutrackConnectionRow {
  projectId: string;
  code: string;
  name: string;
  status: string;
  connected: boolean;
  resource: string | null;
  hasToken: boolean;
  baseUrl: string | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
}

export const BulkConnectInput = z.object({
  baseUrl: z.string().trim().url().max(300),
  /** Omit to keep each project's stored token (the re-run case). */
  token: z.string().trim().min(1).max(500).optional(),
  syncNow: z.boolean().default(true),
  rows: z.array(z.object({ projectId: z.string().uuid(), project: z.string().trim().min(1).max(60) })).min(1).max(100),
});
export type BulkConnectInput = z.infer<typeof BulkConnectInput>;

export interface BulkRow {
  projectId: string;
  code: string;
  outcome: "connected" | "error";
  message?: string;
  /** Present when syncNow ran and succeeded. */
  synced?: { created: number; updated: number; unchanged: number; skipped: number };
}

function assertAdmin(ctx: TenantContext): void {
  if (!can(ctx, "project:update")) throw new YoutrackBulkError("Connecting integrations is for Heads and admins.", "FORBIDDEN");
}

/** Every active project with its YouTrack row (or none). Secrets never leave the server. */
export async function listYoutrackConnections(ctx: TenantContext): Promise<YoutrackConnectionRow[]> {
  assertAdmin(ctx);
  const projects = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { status: { notIn: ["Completed", "Cancelled"] } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        integrations: {
          where: { provider: "youtrack" },
          select: { connected: true, resource: true, secret: true, config: true, lastSyncAt: true, lastSyncError: true },
        },
      },
      orderBy: { code: "asc" },
    }),
  );
  return projects.map((p) => {
    const row = p.integrations[0];
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      connected: row?.connected ?? false,
      resource: row?.resource ?? null,
      hasToken: Boolean(row?.secret),
      baseUrl: parseConfig(row?.config)?.baseUrl ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastSyncError: row?.lastSyncError ?? null,
    };
  });
}

export async function bulkConnectYoutrack(ctx: TenantContext, input: BulkConnectInput): Promise<BulkRow[]> {
  assertAdmin(ctx);
  if (!flagEnabled("youtrack")) throw new YoutrackBulkError("YouTrack mirroring is turned off for this deployment.", "DISABLED");
  const ids = input.rows.map((r) => r.projectId);
  // Visible projects only (RLS) — and their existing field maps, which a bulk connect must not erase.
  const visible = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, integrations: { where: { provider: "youtrack" }, select: { config: true, secret: true } } },
    }),
  );
  const byId = new Map(visible.map((p) => [p.id, p]));
  const out: BulkRow[] = [];
  for (const row of input.rows) {
    const p = byId.get(row.projectId);
    if (!p) {
      out.push({ projectId: row.projectId, code: "?", outcome: "error", message: "No such project." });
      continue;
    }
    const existing = p.integrations[0];
    if (!input.token && !existing?.secret) {
      out.push({ projectId: p.id, code: p.code, outcome: "error", message: "No token stored for this project — enter the token." });
      continue;
    }
    try {
      // The stored field map was validated against QUBIT's taxonomy when it was saved
      // (FieldMapInput); it rides through untouched so a bulk connect never erases it.
      const fieldMap = parseConfig(existing?.config)?.fieldMap as NonNullable<SetIntegrationInput["config"]>["fieldMap"];
      await setIntegration(ctx, p.id, "youtrack", {
        connected: true,
        resource: row.project,
        ...(input.token ? { token: input.token } : {}),
        config: { baseUrl: input.baseUrl, ...(fieldMap ? { fieldMap } : {}) },
      });
      if (!input.syncNow) {
        out.push({ projectId: p.id, code: p.code, outcome: "connected" });
        continue;
      }
      const r = await syncProject(ctx, p.id, { full: true });
      out.push({ projectId: p.id, code: p.code, outcome: "connected", synced: { created: r.created, updated: r.updated, unchanged: r.unchanged, skipped: r.skipped } });
    } catch (e) {
      const message = e instanceof SyncError ? `Connected, but the first sync failed: ${e.message}` : e instanceof Error ? e.message : "Could not connect.";
      out.push({ projectId: p.id, code: p.code, outcome: "error", message });
    }
  }
  return out;
}

export async function bulkDisconnectYoutrack(ctx: TenantContext, projectIds: string[]): Promise<BulkRow[]> {
  assertAdmin(ctx);
  const out: BulkRow[] = [];
  for (const projectId of projectIds) {
    try {
      await setIntegration(ctx, projectId, "youtrack", { connected: false });
      out.push({ projectId, code: "", outcome: "connected" });
    } catch (e) {
      out.push({ projectId, code: "", outcome: "error", message: e instanceof Error ? e.message : "Could not disconnect." });
    }
  }
  return out;
}
